import { prisma, ContentMode } from "@mirai/db";
import { getActiveSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/campaign — current campaign state for the logged-in buyer.
 * PATCH /api/campaign — update mode (AUTONOMOUS|USER_SUPPLIED) and enabled flag.
 */
export async function GET(): Promise<Response> {
  const session = await getActiveSession();
  if (!session) return Response.json({ error: "not authenticated" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { sessionId: session.id },
    include: {
      voiceProfile: true,
      _count: { select: { scheduledPosts: true, contentItems: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ campaign });
}

export async function PATCH(req: Request): Promise<Response> {
  const session = await getActiveSession();
  if (!session) return Response.json({ error: "not authenticated" }, { status: 401 });

  const body = (await req.json()) as {
    contentMode?: ContentMode;
    enabled?: boolean;
  };

  const campaign = await prisma.campaign.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
  });
  if (!campaign) return Response.json({ error: "no campaign" }, { status: 404 });

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      ...(body.contentMode ? { contentMode: body.contentMode } : {}),
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
    },
  });
  return Response.json({ campaign: updated });
}
