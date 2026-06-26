import assert from "node:assert/strict";
import { PostStage } from "@mirai/db";
import {
  ContentLanguage,
  loadEnv,
  resetEnvCache,
} from "@mirai/shared";
import {
  createLlm,
  groundFromX,
  review,
  runDraftTournament,
  scorePerformance,
  writeVariants,
} from "@mirai/content";
import { createXClient } from "@mirai/x";
import { buildContentAgentDeliverable } from "../dist/campaign-report.js";

resetEnvCache();
const env = loadEnv({
  ...process.env,
  X_MODE: "mock",
  LLM_PROVIDER: process.env.LLM_PROVIDER ?? "openmodel",
});

const llm = createLlm(env);
assert.equal(
  llm.kind,
  "openmodel",
  "OpenModel smoke requires LLM_PROVIDER=openmodel and OPENMODEL_API_KEY.",
);

const x = createXClient(env);
assert.equal(x.mode, "mock", "OpenModel smoke must not use real X.");

const accessToken = "mock-token";
const user = await x.getMe(accessToken);
const [timeline, trends] = await Promise.all([
  x.getHomeTimeline(accessToken, user.id),
  x.getPersonalizedTrends(accessToken),
]);

const policy = {
  allowedTopics: ["AI agents", "founder workflows"],
  blockedTopics: [],
  blockedPhrases: [],
  language: ContentLanguage.Any,
  toneRules: ["clear", "practical"],
  formatRules: ["no URLs"],
  requireApprovalFor: [],
};

const signals = groundFromX(timeline, trends, ["AI agents", "founder workflows"], {
  niche: "AI agents for founders",
  recentPosts: [],
  history: [],
});
const angle = signals.angle ?? "AI agents for founder workflows";
const variants = await writeVariants(
  llm,
  { angle, signals, policy },
  {
    tone: "clear, founder-facing, practical",
    topics: ["AI agents", "founder workflows"],
    styleNotes: ["one clear point", "no hype"],
    doNots: ["no URLs", "no exaggerated claims"],
    sampleVoice: "Useful agents do the handoff, not just the suggestion.",
  },
);
const tournament = runDraftTournament({
  drafts: variants,
  recent: [],
  policy,
  topics: ["AI agents", "founder workflows"],
  angle,
});

const verdict = review({ text: tournament.winner.text, recent: [], policy });
assert.equal(verdict.ok, true, `winner failed review: ${verdict.reasons.join("; ")}`);
assert.equal(tournament.variantCount, 5);
assert.equal(/https?:\/\/|\bwww\./i.test(tournament.winner.text), false);
assert.ok(tournament.winner.text.length > 0);
assert.ok(tournament.winner.text.length <= 280);

const postResult = await x.postTweet(accessToken, tournament.winner.text);
const metricMap = await x.getTweetMetrics(accessToken, [postResult.id]);
const metrics = metricMap[postResult.id];
assert.ok(metrics, "mock metrics should be available for the posted tweet");

const rawMaterial = JSON.stringify({
  kind: "autonomous",
  signals,
  draftTournament: tournament,
});
const report = buildContentAgentDeliverable(
  {
    id: "smoke-campaign-openmodel",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    accessExpiresAt: new Date("2026-06-08T00:00:00.000Z"),
    order: {
      crooOrderId: "smoke-croo-order-openmodel",
      negotiationId: "smoke-negotiation-openmodel",
      status: "DELIVERED",
      service: "content-agent-7d",
      deliveredAt: new Date("2026-06-01T00:00:30.000Z"),
    },
    session: { xConnection: { xHandle: user.username } },
    scheduledPosts: [
      {
        scheduledFor: new Date("2026-06-02T00:00:00.000Z"),
        postedAt: new Date("2026-06-02T00:01:00.000Z"),
        tweetId: postResult.id,
        tweetUrl: postResult.url,
        draftText: tournament.winner.text,
        angle,
        stage: PostStage.RECORDED,
        metrics: { ...metrics, performanceScore: scorePerformance(metrics) },
        rawMaterial,
      },
    ],
    a2aDelegations: [],
  },
  () => null,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      llmKind: llm.kind,
      xMode: x.mode,
      model: env.OPENMODEL_MODEL,
      angle,
      selectedSignals: signals.selectedSignals?.length ?? 0,
      draftTournament: {
        variantCount: tournament.variantCount,
        winnerStyle: tournament.winner.style,
        winnerScore: tournament.winner.score,
        winnerChars: tournament.winner.text.length,
        winnerReasons: tournament.winner.reasons,
      },
      review: verdict,
      post: postResult,
      metrics,
      report: {
        upstreamCrooOrderId: report.capProof.upstreamCrooOrderId,
        a2aTotal: report.a2aSummary.total,
        posted: report.summary.posted,
        draftTournamentVariantCount: report.posts[0]?.draftTournament?.variantCount,
        reportWinnerStyle: report.posts[0]?.draftTournament?.winner.style,
        learningSummary: report.learning.summary,
      },
    },
    null,
    2,
  ),
);
