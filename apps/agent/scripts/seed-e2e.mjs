// End-to-end seed: create one ACTIVE campaign with due posts, so the running
// agent's scheduler fans them through ACQUIRE→COMPOSE→REVIEW→POST→RECORD.
// Run from apps/agent: `node scripts/seed-e2e.mjs`
import { prisma } from "@mirai/db";
import { encryptToken } from "@mirai/shared";

const VAULT_KEY = process.env.TOKEN_VAULT_KEY;
if (!VAULT_KEY) throw new Error("TOKEN_VAULT_KEY required");

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const past = new Date(Date.now() - 60 * 1000);

const session = await prisma.accessSession.create({
  data: { buyerWallet: "0xtestwallet000000000000000000000000000001", accessExpiresAt: future },
});

await prisma.xConnection.create({
  data: {
    sessionId: session.id,
    xUserId: "mock-user-1",
    xHandle: "mockuser",
    encryptedAccessToken: encryptToken("dummy-access", VAULT_KEY),
    encryptedRefreshToken: encryptToken("dummy-refresh", VAULT_KEY),
    scope: "tweet.read tweet.write users.read offline.access",
    accessTokenExpiresAt: future,
    tweetCount: 42,
  },
});

const order = await prisma.order.create({
  data: {
    crooOrderId: "e2e-order-" + session.id.slice(0, 8),
    buyerWallet: session.buyerWallet,
    service: "content-agent-7d",
    status: "PAID",
    sessionId: session.id,
  },
});

const campaign = await prisma.campaign.create({
  data: {
    orderId: order.id,
    sessionId: session.id,
    contentMode: "AUTONOMOUS",
    enabled: true,
    status: "ACTIVE",
    accessExpiresAt: future,
  },
});

await prisma.voiceProfile.create({
  data: {
    campaignId: campaign.id,
    source: "DERIVED",
    tone: "concise, builder-minded",
    topics: ["AI agents", "shipping", "indie hacking"],
    styleNotes: ["short sentences", "one idea per post"],
    doNots: ["no engagement bait"],
    sampleVoice: "Shipped a thing today. Small, but it works.",
  },
});

await prisma.scheduledPost.createMany({
  data: [0, 1, 2].map((i) => ({
    campaignId: campaign.id,
    slotIndex: i,
    scheduledFor: past,
    stage: "PLANNED",
  })),
});

console.log("SEEDED campaignId=" + campaign.id);
await prisma.$disconnect();
