import { Redis } from "ioredis";
import { loadEnv, campaignChannel } from "@mirai/shared";
import { prisma } from "@mirai/db";
import { getActiveSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events — Server-Sent Events stream of pipeline progress for the
 * buyer's campaign. Subscribes to the agent's Redis channel and proxies each
 * event to the browser. The agent stays the single owner of the CROO socket;
 * the dashboard only ever reads this derived stream.
 */
export async function GET(): Promise<Response> {
  const session = await getActiveSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!campaign) return new Response("no campaign", { status: 404 });

  const env = loadEnv();
  const channel = campaignChannel(env.AGENT_EVENT_CHANNEL, campaign.id);
  const sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: string) =>
        controller.enqueue(enc.encode(`data: ${data}\n\n`));

      send(JSON.stringify({ type: "hello", campaignId: campaign.id }));
      await sub.subscribe(channel);
      sub.on("message", (_chan, message) => send(message));

      // Heartbeat to keep intermediaries from closing the connection.
      const hb = setInterval(
        () => controller.enqueue(enc.encode(": ping\n\n")),
        25000,
      );

      // Best-effort cleanup when the client disconnects.
      const cleanup = () => {
        clearInterval(hb);
        void sub.quit();
      };
      sub.on("end", cleanup);
    },
    cancel() {
      void sub.quit();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
