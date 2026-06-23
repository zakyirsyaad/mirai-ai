import { redirect } from "next/navigation";
import { prisma } from "@mirai/db";
import { getActiveSession } from "@/lib/session";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

/**
 * Authenticated dashboard. Server-loads the buyer's campaign + X connection,
 * then hands off to a client component for interactivity + the live SSE feed.
 */
export default async function Dashboard() {
  const session = await getActiveSession();
  if (!session) redirect("/");

  const campaign = await prisma.campaign.findFirst({
    where: { sessionId: session.id },
    include: {
      voiceProfile: true,
      session: { include: { xConnection: true } },
      _count: { select: { scheduledPosts: true, contentItems: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const xConn = campaign?.session.xConnection ?? null;

  return (
    <main className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Dashboard</h1>
        <span className="tag">
          {session.buyerWallet.slice(0, 6)}…{session.buyerWallet.slice(-4)}
        </span>
      </div>
      <p className="muted">
        Access until {session.accessExpiresAt.toISOString().slice(0, 10)}.
      </p>

      <DashboardClient
        initial={{
          hasCampaign: !!campaign,
          campaignId: campaign?.id ?? null,
          status: campaign?.status ?? null,
          contentMode: campaign?.contentMode ?? "AUTONOMOUS",
          enabled: campaign?.enabled ?? false,
          xHandle: xConn?.xHandle ?? null,
          xConnected: !!xConn,
          coldStart: xConn ? xConn.tweetCount === 0 : false,
          plannedPosts: campaign?._count.scheduledPosts ?? 0,
          poolItems: campaign?._count.contentItems ?? 0,
        }}
      />
    </main>
  );
}
