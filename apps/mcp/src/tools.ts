import {
  CampaignStatus,
  ContentItemStatus,
  ContentMode,
  PostStage,
  VoiceProfileSource,
  prisma,
} from "@mirai/db";
import {
  ContentAgentDeliverableSchema,
  LicenseScope,
  ServiceType,
  VoiceIdeasDeliverableSchema,
  VoiceProfileSchema,
  decryptToken,
  loadEnv,
  verifyLicense,
  type ContentAgentDeliverable,
  type VoiceProfilePayload,
} from "@mirai/shared";
import {
  buildVoiceProfileFromQuestionnaire,
  createLlm,
  generateContentIdeas,
} from "@mirai/content";
import { createXClient } from "@mirai/x";
import { writeLocalLicense } from "./license-store.js";
import { checkRemoteEntitlement } from "./entitlement-client.js";
import { ensureLocalAccess } from "./local-access.js";
import { connectXWithLocalCallback } from "./local-oauth.js";
import {
  hostedActivate,
  hostedAddContentItems,
  hostedConnectX,
  hostedCreateCampaign,
  hostedGenerateVoiceIdeas,
  hostedGetCampaign,
  hostedGetReport,
  hostedHealthcheck,
  hostedPauseAutopost,
  hostedResumeAutopost,
  hostedSetVoiceProfile,
  hostedStartAutopost,
  isHostedMode,
} from "./hosted-client.js";

export async function activateLicense(licenseKey: string): Promise<unknown> {
  if (isHostedMode()) return hostedActivate(licenseKey);
  const env = loadEnv();
  if (!env.MIRAI_LICENSE_PUBLIC_KEY) {
    throw new Error("MIRAI_LICENSE_PUBLIC_KEY is required.");
  }
  const verified = verifyLicense(licenseKey.trim(), env.MIRAI_LICENSE_PUBLIC_KEY);
  await checkRemoteEntitlement({ licenseKey: licenseKey.trim(), action: "activate" });
  await writeLocalLicense(licenseKey.trim());
  const access = await ensureLocalAccess();
  return {
    ok: true,
    service: verified.payload.service,
    wallet: verified.payload.wallet,
    expiresAt: verified.payload.expiresAt,
    campaignId: access.campaignId,
  };
}

export async function healthcheck(): Promise<unknown> {
  if (isHostedMode()) return hostedHealthcheck();
  const envOk = safeLoadEnv();
  let db = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch (err) {
    db = err instanceof Error ? err.message : "failed";
  }
  let license: unknown = null;
  try {
    const access = await ensureLocalAccess();
    license = {
      service: access.service,
      expiresAt: access.expiresAt.toISOString(),
      campaignId: access.campaignId,
    };
  } catch (err) {
    license = err instanceof Error ? err.message : "not activated";
  }
  return {
    ok: envOk.ok && db === "ok",
    env: envOk,
    db,
    license,
  };
}

export async function connectX(): Promise<unknown> {
  if (isHostedMode()) return hostedConnectX();
  const result = await connectXWithLocalCallback();
  return { ok: true, ...result };
}

export async function createCampaign(args: {
  contentMode?: ContentMode;
  niche?: string;
  audience?: string;
  goal?: string;
  toneHint?: string;
}): Promise<unknown> {
  if (isHostedMode()) return hostedCreateCampaign(args);
  const access = await ensureLocalAccess(LicenseScope.CampaignCreate);
  if (access.service !== ServiceType.ContentAgent7d) {
    throw new Error("This license does not include autopost campaigns.");
  }
  if (!access.campaignId) throw new Error("No campaign exists for this license.");

  const campaign = await prisma.campaign.update({
    where: { id: access.campaignId },
    data: {
      contentMode: args.contentMode ?? ContentMode.AUTONOMOUS,
      enabled: true,
    },
  });

  if (args.niche && args.audience && args.goal) {
    const env = loadEnv();
    const llm = createLlm(env);
    const voice = await buildVoiceProfileFromQuestionnaire(llm, {
      niche: args.niche,
      audience: args.audience,
      goal: args.goal,
      toneHint: args.toneHint,
    });
    await upsertVoiceProfile(campaign.id, voice, {
      source: VoiceProfileSource.QUESTIONNAIRE,
      niche: args.niche,
      audience: args.audience,
      goal: args.goal,
    });
  }

  return getCampaign();
}

export async function setVoiceProfile(profile: VoiceProfilePayload): Promise<unknown> {
  if (isHostedMode()) return hostedSetVoiceProfile(profile);
  const access = await ensureLocalAccess(LicenseScope.CampaignWrite);
  if (!access.campaignId) throw new Error("No campaign exists for this license.");
  await upsertVoiceProfile(access.campaignId, VoiceProfileSchema.parse(profile), {
    source: VoiceProfileSource.MANUAL_OVERRIDE,
  });
  return { ok: true, campaignId: access.campaignId };
}

export async function addContentItems(items: string[]): Promise<unknown> {
  if (isHostedMode()) return hostedAddContentItems(items);
  const access = await ensureLocalAccess(LicenseScope.CampaignWrite);
  if (!access.campaignId) throw new Error("No campaign exists for this license.");
  const clean = items.map((item) => item.trim()).filter(Boolean).slice(0, 50);
  await prisma.contentItem.createMany({
    data: clean.map((rawText) => ({
      campaignId: access.campaignId as string,
      rawText,
      status: ContentItemStatus.PENDING,
    })),
  });
  await prisma.campaign.update({
    where: { id: access.campaignId },
    data: { contentMode: ContentMode.USER_SUPPLIED },
  });
  return { ok: true, added: clean.length };
}

export async function startAutopost(approved: boolean): Promise<unknown> {
  if (isHostedMode()) return hostedStartAutopost(approved);
  if (!approved) {
    throw new Error("Set approved=true to allow Mirai to post automatically until expiry.");
  }
  const access = await ensureLocalAccess(LicenseScope.XPost);
  if (!access.campaignId) throw new Error("No campaign exists for this license.");
  await checkRemoteEntitlement({ licenseKey: access.licenseKey, action: "start" });

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: access.campaignId },
    include: { voiceProfile: true, session: { include: { xConnection: true } } },
  });
  if (!campaign.voiceProfile) throw new Error("Set a voice profile before starting.");
  if (!campaign.session.xConnection) throw new Error("Connect X before starting.");

  const { enqueueCampaignStart } = await import("@mirai/agent");
  await enqueueCampaignStart(campaign.id);
  return {
    ok: true,
    campaignId: campaign.id,
    xHandle: campaign.session.xConnection.xHandle,
    posts: 14,
    expiresAt: access.expiresAt.toISOString(),
    approval: "Mirai may post automatically until expiry.",
  };
}

export async function pauseAutopost(): Promise<unknown> {
  if (isHostedMode()) return hostedPauseAutopost();
  const access = await ensureLocalAccess(LicenseScope.CampaignWrite);
  if (!access.campaignId) throw new Error("No campaign exists for this license.");
  await prisma.campaign.update({
    where: { id: access.campaignId },
    data: { status: CampaignStatus.PAUSED, enabled: false },
  });
  return { ok: true, campaignId: access.campaignId, status: "PAUSED" };
}

export async function resumeAutopost(): Promise<unknown> {
  if (isHostedMode()) return hostedResumeAutopost();
  const access = await ensureLocalAccess(LicenseScope.XPost);
  if (!access.campaignId) throw new Error("No campaign exists for this license.");
  await checkRemoteEntitlement({ licenseKey: access.licenseKey, action: "resume" });
  await prisma.campaign.update({
    where: { id: access.campaignId },
    data: { status: CampaignStatus.ACTIVE, enabled: true },
  });
  return { ok: true, campaignId: access.campaignId, status: "ACTIVE" };
}

export async function getCampaign(): Promise<unknown> {
  if (isHostedMode()) return hostedGetCampaign();
  const access = await ensureLocalAccess();
  if (!access.campaignId) {
    return { ok: true, service: access.service, campaign: null };
  }
  const campaign = await prisma.campaign.findUnique({
    where: { id: access.campaignId },
    include: {
      voiceProfile: true,
      session: { include: { xConnection: true } },
      scheduledPosts: { orderBy: { slotIndex: "asc" } },
      _count: { select: { contentItems: true } },
    },
  });
  return {
    ok: true,
    campaign: campaign
      ? {
          id: campaign.id,
          status: campaign.status,
          enabled: campaign.enabled,
          contentMode: campaign.contentMode,
          expiresAt: campaign.accessExpiresAt.toISOString(),
          xHandle: campaign.session.xConnection?.xHandle ?? null,
          hasVoiceProfile: !!campaign.voiceProfile,
          contentItems: campaign._count.contentItems,
          posts: summarizePosts(campaign.scheduledPosts),
        }
      : null,
  };
}

export async function getReport(): Promise<ContentAgentDeliverable | unknown> {
  if (isHostedMode()) return hostedGetReport();
  const access = await ensureLocalAccess(LicenseScope.ReportRead);
  if (!access.campaignId) return { ok: true, report: null };
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: access.campaignId },
    include: {
      session: { include: { xConnection: true } },
      scheduledPosts: { orderBy: { slotIndex: "asc" } },
    },
  });
  const posts = campaign.scheduledPosts;
  return ContentAgentDeliverableSchema.parse({
    service: ServiceType.ContentAgent7d,
    campaignId: campaign.id,
    xHandle: campaign.session.xConnection?.xHandle ?? "unknown",
    windowStart: campaign.createdAt.toISOString(),
    windowEnd: campaign.accessExpiresAt.toISOString(),
    summary: {
      planned: posts.length,
      posted: posts.filter((p) => p.stage === PostStage.RECORDED || p.tweetId).length,
      skipped: posts.filter((p) => p.stage === PostStage.SKIPPED).length,
      failed: posts.filter((p) => p.stage === PostStage.FAILED).length,
    },
    posts: posts.map((p) => ({
      scheduledFor: p.scheduledFor.toISOString(),
      postedAt: p.postedAt?.toISOString() ?? null,
      tweetId: p.tweetId,
      tweetUrl: p.tweetUrl,
      text: p.draftText ?? "",
      status: p.stage === PostStage.SKIPPED ? "SKIPPED" : p.tweetId ? "POSTED" : "FAILED",
      metrics: p.metrics ?? undefined,
    })),
  });
}

export async function generateVoiceIdeas(): Promise<unknown> {
  if (isHostedMode()) return hostedGenerateVoiceIdeas();
  const access = await ensureLocalAccess(LicenseScope.VoiceIdeas);
  const env = loadEnv();
  const llm = createLlm(env);
  const x = createXClient(env);
  const session = await prisma.accessSession.findUniqueOrThrow({
    where: { id: access.sessionId },
    include: { xConnection: true },
  });
  if (!session.xConnection) throw new Error("Connect X before generating ideas.");
  const accessToken = env.TOKEN_VAULT_KEY
    ? decryptToken(session.xConnection.encryptedAccessToken, env.TOKEN_VAULT_KEY)
    : "mock";
  const tweets = await x.getUserTweets(accessToken, session.xConnection.xUserId, 50);
  const voice = await buildVoiceProfileFromQuestionnaire(llm, {
    niche: tweets[0]?.text ?? "builder-led content",
    audience: "X followers",
    goal: "share useful ideas consistently",
  });
  const ideas = await generateContentIdeas(llm, voice);
  return VoiceIdeasDeliverableSchema.parse({
    service: ServiceType.VoiceIdeas,
    xHandle: session.xConnection.xHandle,
    voiceProfile: voice,
    ideas: ideas.slice(0, 10),
  });
}

async function upsertVoiceProfile(
  campaignId: string,
  voice: VoiceProfilePayload,
  meta: {
    source: VoiceProfileSource;
    niche?: string;
    audience?: string;
    goal?: string;
  },
): Promise<void> {
  await prisma.voiceProfile.upsert({
    where: { campaignId },
    create: {
      campaignId,
      source: meta.source,
      tone: voice.tone,
      topics: voice.topics,
      styleNotes: voice.styleNotes,
      doNots: voice.doNots,
      sampleVoice: voice.sampleVoice,
      niche: meta.niche,
      audience: meta.audience,
      goal: meta.goal,
    },
    update: {
      source: meta.source,
      tone: voice.tone,
      topics: voice.topics,
      styleNotes: voice.styleNotes,
      doNots: voice.doNots,
      sampleVoice: voice.sampleVoice,
      niche: meta.niche,
      audience: meta.audience,
      goal: meta.goal,
    },
  });
}

function summarizePosts(posts: { stage: PostStage; tweetId: string | null }[]): unknown {
  return {
    planned: posts.length,
    posted: posts.filter((p) => p.tweetId).length,
    skipped: posts.filter((p) => p.stage === PostStage.SKIPPED).length,
    failed: posts.filter((p) => p.stage === PostStage.FAILED).length,
  };
}

function safeLoadEnv(): { ok: boolean; error?: string } {
  try {
    loadEnv();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "invalid env" };
  }
}
