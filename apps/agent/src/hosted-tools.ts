import {
  CampaignStatus,
  ContentItemStatus,
  ContentMode,
  type ContentPolicy as DbContentPolicy,
  EntitlementStatus,
  PostStage,
  VoiceProfileSource,
  prisma,
} from "@mirai/db";
import {
  ContentAgentDeliverableSchema,
  ContentPolicySchema,
  LicenseScope,
  ServiceType,
  VoiceIdeasDeliverableSchema,
  VoiceProfileSchema,
  assertLicenseScope,
  decryptToken,
  encryptToken,
  loadEnv,
  type ContentAgentDeliverable,
  type ContentPolicyPayload,
  type LicensePayload,
  type VoiceProfilePayload,
} from "@mirai/shared";
import {
  buildVoiceProfileFromQuestionnaire,
  createLlm,
  generateContentIdeas,
} from "@mirai/content";
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  createXClient,
  exchangeCodeForTokens,
} from "@mirai/x";
import { campaignQueue } from "./queues.js";
import { checkEntitlement, type SensitiveAction } from "./entitlements.js";
import { redactA2ASecrets } from "./a2a/redaction.js";

const env = loadEnv();

interface HostedAccess {
  licenseKey: string;
  payload: LicensePayload;
  orderId: string;
  sessionId: string;
  campaignId: string | null;
  expiresAt: Date;
}

interface PendingOAuth {
  licenseKey: string;
  verifier: string;
  sessionId: string;
}

const pendingOAuth = new Map<string, PendingOAuth>();

export async function hostedActivate(licenseKey: string): Promise<unknown> {
  const access = await ensureHostedAccess(licenseKey, undefined, "activate");
  return {
    ok: true,
    service: access.payload.service,
    wallet: access.payload.wallet,
    expiresAt: access.payload.expiresAt,
    campaignId: access.campaignId,
  };
}

export async function hostedHealth(): Promise<unknown> {
  let db = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch (err) {
    db = err instanceof Error ? err.message : "failed";
  }
  return {
    ok: db === "ok",
    service: "mirai-hosted-api",
    runtime: "hosted",
    db,
  };
}

export async function hostedConnectX(licenseKey: string): Promise<unknown> {
  const access = await ensureHostedAccess(licenseKey);
  if (env.X_MODE === "mock") {
    const x = createXClient(env);
    const me = await x.getMe("mock-access-token");
    await upsertXConnection(access.sessionId, {
      xUserId: me.id,
      xHandle: me.username,
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      scope: "mock",
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      tweetCount: me.tweetCount,
    });
    return { ok: true, mode: "mock", xHandle: me.username, xUserId: me.id };
  }

  if (!env.X_CLIENT_ID) throw new Error("X_CLIENT_ID is required.");
  const { verifier, challenge } = createPkcePair();
  const state = createState();
  pendingOAuth.set(state, {
    licenseKey,
    verifier,
    sessionId: access.sessionId,
  });
  const redirectUri = `${env.MIRAI_API_URL.replace(/\/$/, "")}/oauth/x/callback`;
  const authUrl = buildAuthorizeUrl({
    clientId: env.X_CLIENT_ID,
    redirectUri,
    state,
    challenge,
  });
  return { ok: true, mode: "oauth", authUrl, redirectUri };
}

export async function hostedXCallback(url: URL): Promise<string> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new Error("Missing X OAuth code/state.");
  const pending = pendingOAuth.get(state);
  pendingOAuth.delete(state);
  if (!pending) throw new Error("Unknown or expired X OAuth state.");
  if (!env.X_CLIENT_ID || !env.TOKEN_VAULT_KEY) {
    throw new Error("X_CLIENT_ID and TOKEN_VAULT_KEY are required.");
  }
  const redirectUri = `${env.MIRAI_API_URL.replace(/\/$/, "")}/oauth/x/callback`;
  const tokens = await exchangeCodeForTokens({
    code,
    verifier: pending.verifier,
    clientId: env.X_CLIENT_ID,
    clientSecret: env.X_CLIENT_SECRET,
    redirectUri,
  });
  const x = createXClient(env);
  const me = await x.getMe(tokens.accessToken);
  await upsertXConnection(pending.sessionId, {
    xUserId: me.id,
    xHandle: me.username,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    scope: tokens.scope,
    expiresAt: tokens.expiresAt,
    tweetCount: me.tweetCount,
  });
  return `Mirai X connection complete for @${me.username}. You can close this tab.`;
}

export async function hostedCreateCampaign(
  licenseKey: string,
  args: {
    contentMode?: ContentMode;
    niche?: string;
    audience?: string;
    goal?: string;
    toneHint?: string;
    contentPolicy?: ContentPolicyPayload;
  },
): Promise<unknown> {
  const access = await ensureHostedAccess(
    licenseKey,
    LicenseScope.CampaignCreate,
  );
  if (access.payload.service !== ServiceType.ContentAgent7d) {
    throw new Error("This license does not include autopost campaigns.");
  }
  if (!access.campaignId)
    throw new Error("No campaign exists for this license.");
  const campaign = await prisma.campaign.update({
    where: { id: access.campaignId },
    data: {
      contentMode: args.contentMode ?? ContentMode.AUTONOMOUS,
      enabled: true,
    },
  });
  if (args.niche && args.audience && args.goal) {
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
  if (args.contentPolicy) {
    await upsertContentPolicy(campaign.id, args.contentPolicy);
  }
  return hostedGetCampaign(licenseKey);
}

export async function hostedSetContentPolicy(
  licenseKey: string,
  policy: ContentPolicyPayload,
): Promise<unknown> {
  const access = await ensureHostedAccess(
    licenseKey,
    LicenseScope.CampaignWrite,
  );
  if (!access.campaignId)
    throw new Error("No campaign exists for this license.");
  const saved = await upsertContentPolicy(access.campaignId, policy);
  return {
    ok: true,
    campaignId: access.campaignId,
    contentPolicy: serializeContentPolicy(saved),
  };
}

export async function hostedSetVoiceProfile(
  licenseKey: string,
  profile: VoiceProfilePayload,
): Promise<unknown> {
  const access = await ensureHostedAccess(
    licenseKey,
    LicenseScope.CampaignWrite,
  );
  if (!access.campaignId)
    throw new Error("No campaign exists for this license.");
  await upsertVoiceProfile(
    access.campaignId,
    VoiceProfileSchema.parse(profile),
    {
      source: VoiceProfileSource.MANUAL_OVERRIDE,
    },
  );
  return { ok: true, campaignId: access.campaignId };
}

export async function hostedAddContentItems(
  licenseKey: string,
  items: string[],
): Promise<unknown> {
  const access = await ensureHostedAccess(
    licenseKey,
    LicenseScope.CampaignWrite,
  );
  if (!access.campaignId)
    throw new Error("No campaign exists for this license.");
  const clean = items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
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

export async function hostedStartAutopost(
  licenseKey: string,
  approved: boolean,
): Promise<unknown> {
  if (!approved) {
    throw new Error(
      "Set approved=true to allow Mirai to post automatically until expiry.",
    );
  }
  const access = await ensureHostedAccess(
    licenseKey,
    LicenseScope.XPost,
    "start",
  );
  if (!access.campaignId)
    throw new Error("No campaign exists for this license.");
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: access.campaignId },
    include: {
      voiceProfile: true,
      session: { include: { xConnection: true } },
    },
  });
  if (!campaign.voiceProfile)
    throw new Error("Set a voice profile before starting.");
  if (!campaign.session.xConnection)
    throw new Error("Connect X before starting.");
  await campaignQueue.add(
    "start",
    { action: "start", campaignId: campaign.id },
    { jobId: `start--${campaign.id}` },
  );
  return {
    ok: true,
    mode: "hosted",
    campaignId: campaign.id,
    xHandle: campaign.session.xConnection.xHandle,
    posts: 14,
    expiresAt: access.payload.expiresAt,
    approval: "Mirai hosted worker may post automatically until expiry.",
  };
}

export async function hostedPauseAutopost(
  licenseKey: string,
): Promise<unknown> {
  const access = await ensureHostedAccess(
    licenseKey,
    LicenseScope.CampaignWrite,
  );
  if (!access.campaignId)
    throw new Error("No campaign exists for this license.");
  await prisma.campaign.update({
    where: { id: access.campaignId },
    data: { status: CampaignStatus.PAUSED, enabled: false },
  });
  return { ok: true, campaignId: access.campaignId, status: "PAUSED" };
}

export async function hostedResumeAutopost(
  licenseKey: string,
): Promise<unknown> {
  const access = await ensureHostedAccess(
    licenseKey,
    LicenseScope.XPost,
    "resume",
  );
  if (!access.campaignId)
    throw new Error("No campaign exists for this license.");
  await prisma.campaign.update({
    where: { id: access.campaignId },
    data: { status: CampaignStatus.ACTIVE, enabled: true },
  });
  return { ok: true, campaignId: access.campaignId, status: "ACTIVE" };
}

export async function hostedGetCampaign(licenseKey: string): Promise<unknown> {
  const access = await ensureHostedAccess(licenseKey);
  if (!access.campaignId) {
    return { ok: true, service: access.payload.service, campaign: null };
  }
  const campaign = await prisma.campaign.findUnique({
    where: { id: access.campaignId },
    include: {
      voiceProfile: true,
      contentPolicy: true,
      session: { include: { xConnection: true } },
      scheduledPosts: { orderBy: { slotIndex: "asc" } },
      _count: { select: { contentItems: true } },
    },
  });
  return {
    ok: true,
    mode: "hosted",
    campaign: campaign
      ? {
          id: campaign.id,
          status: campaign.status,
          enabled: campaign.enabled,
          contentMode: campaign.contentMode,
          expiresAt: campaign.accessExpiresAt.toISOString(),
          xHandle: campaign.session.xConnection?.xHandle ?? null,
          hasVoiceProfile: !!campaign.voiceProfile,
          contentPolicy: campaign.contentPolicy
            ? serializeContentPolicy(campaign.contentPolicy)
            : null,
          contentItems: campaign._count.contentItems,
          posts: summarizePosts(campaign.scheduledPosts),
        }
      : null,
  };
}

export async function hostedGetReport(
  licenseKey: string,
): Promise<ContentAgentDeliverable | unknown> {
  const access = await ensureHostedAccess(licenseKey, LicenseScope.ReportRead);
  if (!access.campaignId) return { ok: true, report: null };
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: access.campaignId },
    include: {
      session: { include: { xConnection: true } },
      scheduledPosts: { orderBy: { slotIndex: "asc" } },
      a2aDelegations: { orderBy: { createdAt: "asc" } },
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
      posted: posts.filter((p) => p.stage === PostStage.RECORDED || p.tweetId)
        .length,
      skipped: posts.filter((p) => p.stage === PostStage.SKIPPED).length,
      failed: posts.filter((p) => p.stage === PostStage.FAILED).length,
    },
    posts: posts.map((p) => ({
      scheduledFor: p.scheduledFor.toISOString(),
      postedAt: p.postedAt?.toISOString() ?? null,
      tweetId: p.tweetId,
      tweetUrl: p.tweetUrl,
      text: p.draftText ?? "",
      status:
        p.stage === PostStage.SKIPPED
          ? "SKIPPED"
          : p.tweetId
            ? "POSTED"
            : "FAILED",
      metrics: p.metrics ?? undefined,
    })),
    a2aDelegations: campaign.a2aDelegations.map((delegation) => ({
      downstreamAgent: delegation.downstreamAgent,
      downstreamServiceId: delegation.downstreamServiceId,
      downstreamNegotiationId: delegation.downstreamNegotiationId,
      downstreamOrderId: delegation.downstreamOrderId,
      status: delegation.status,
      request: delegation.requestJson,
      response: redactA2ASecrets(delegation.responseJson ?? null),
      error: delegation.error,
      startedAt: delegation.startedAt.toISOString(),
      paidAt: delegation.paidAt?.toISOString() ?? null,
      completedAt: delegation.completedAt?.toISOString() ?? null,
    })),
  });
}

export async function hostedGenerateVoiceIdeas(
  licenseKey: string,
): Promise<unknown> {
  const access = await ensureHostedAccess(licenseKey, LicenseScope.VoiceIdeas);
  const llm = createLlm(env);
  const x = createXClient(env);
  const session = await prisma.accessSession.findUniqueOrThrow({
    where: { id: access.sessionId },
    include: { xConnection: true },
  });
  if (!session.xConnection)
    throw new Error("Connect X before generating ideas.");
  const accessToken = env.TOKEN_VAULT_KEY
    ? decryptToken(
        session.xConnection.encryptedAccessToken,
        env.TOKEN_VAULT_KEY,
      )
    : "mock";
  const tweets = await x.getUserTweets(
    accessToken,
    session.xConnection.xUserId,
    50,
  );
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

async function ensureHostedAccess(
  licenseKey: string,
  scope?: LicenseScope,
  action: SensitiveAction = "activate",
): Promise<HostedAccess> {
  const checked = await checkEntitlement({ licenseKey, action });
  if (!checked.ok) throw new Error(checked.reason);
  if (scope) assertLicenseScope(checked.payload, scope);
  const payload = checked.payload;
  const expiresAt = new Date(payload.expiresAt);
  const order = await prisma.order.findUnique({
    where: { crooOrderId: payload.orderId },
    include: { session: true, campaign: true, entitlement: true },
  });
  if (!order?.session)
    throw new Error("No order/session found for entitlement.");
  if (!order.entitlement) {
    await prisma.entitlement.create({
      data: {
        orderId: order.id,
        crooOrderId: payload.orderId,
        buyerWallet: payload.wallet,
        service: payload.service,
        licenseKey,
        issuedAt: new Date(payload.issuedAt),
        expiresAt,
        scopes: payload.scopes,
        limits: payload.limits,
        status: EntitlementStatus.ACTIVE,
      },
    });
  }
  const campaign =
    order.campaign ??
    (payload.service === ServiceType.ContentAgent7d
      ? await prisma.campaign.create({
          data: {
            orderId: order.id,
            sessionId: order.session.id,
            contentMode: ContentMode.AUTONOMOUS,
            enabled: true,
            status: CampaignStatus.WAITING_FOR_X,
            accessExpiresAt: expiresAt,
          },
        })
      : null);
  return {
    licenseKey,
    payload,
    orderId: order.id,
    sessionId: order.session.id,
    campaignId: campaign?.id ?? null,
    expiresAt,
  };
}

async function upsertXConnection(
  sessionId: string,
  data: {
    xUserId: string;
    xHandle: string;
    accessToken: string;
    refreshToken: string;
    scope: string;
    expiresAt: number;
    tweetCount: number;
  },
): Promise<void> {
  if (!env.TOKEN_VAULT_KEY) throw new Error("TOKEN_VAULT_KEY is required.");
  await prisma.xConnection.upsert({
    where: { sessionId },
    create: {
      sessionId,
      xUserId: data.xUserId,
      xHandle: data.xHandle,
      encryptedAccessToken: encryptToken(data.accessToken, env.TOKEN_VAULT_KEY),
      encryptedRefreshToken: encryptToken(
        data.refreshToken,
        env.TOKEN_VAULT_KEY,
      ),
      scope: data.scope,
      accessTokenExpiresAt: new Date(data.expiresAt),
      tweetCount: data.tweetCount,
    },
    update: {
      xUserId: data.xUserId,
      xHandle: data.xHandle,
      encryptedAccessToken: encryptToken(data.accessToken, env.TOKEN_VAULT_KEY),
      encryptedRefreshToken: encryptToken(
        data.refreshToken,
        env.TOKEN_VAULT_KEY,
      ),
      scope: data.scope,
      accessTokenExpiresAt: new Date(data.expiresAt),
      tweetCount: data.tweetCount,
    },
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

async function upsertContentPolicy(
  campaignId: string,
  policy: ContentPolicyPayload,
): Promise<DbContentPolicy> {
  const parsed = ContentPolicySchema.parse(policy);
  return prisma.contentPolicy.upsert({
    where: { campaignId },
    create: {
      campaignId,
      allowedTopics: parsed.allowedTopics,
      blockedTopics: parsed.blockedTopics,
      blockedPhrases: parsed.blockedPhrases,
      language: parsed.language,
      toneRules: parsed.toneRules,
      formatRules: parsed.formatRules,
      requireApprovalFor: parsed.requireApprovalFor,
    },
    update: {
      allowedTopics: parsed.allowedTopics,
      blockedTopics: parsed.blockedTopics,
      blockedPhrases: parsed.blockedPhrases,
      language: parsed.language,
      toneRules: parsed.toneRules,
      formatRules: parsed.formatRules,
      requireApprovalFor: parsed.requireApprovalFor,
    },
  });
}

function serializeContentPolicy(policy: DbContentPolicy): ContentPolicyPayload {
  return ContentPolicySchema.parse({
    allowedTopics: policy.allowedTopics,
    blockedTopics: policy.blockedTopics,
    blockedPhrases: policy.blockedPhrases,
    language: policy.language,
    toneRules: policy.toneRules,
    formatRules: policy.formatRules,
    requireApprovalFor: policy.requireApprovalFor,
  });
}

function summarizePosts(
  posts: { stage: PostStage; tweetId: string | null }[],
): unknown {
  return {
    planned: posts.length,
    posted: posts.filter((p) => p.tweetId).length,
    skipped: posts.filter((p) => p.stage === PostStage.SKIPPED).length,
    failed: posts.filter((p) => p.stage === PostStage.FAILED).length,
  };
}
