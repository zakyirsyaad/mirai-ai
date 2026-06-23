import { prisma, ContentItemStatus } from "@mirai/db";
import { getActiveSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/campaign/content — add raw items to the USER_SUPPLIED content pool.
 * GET  /api/campaign/content — list pool items for the current campaign.
 *
 * Body (POST): { items: string[] }
 */
export async function GET(): Promise<Response> {
  const session = await getActiveSession();
  if (!session) return Response.json({ error: "not authenticated" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
  });
  if (!campaign) return Response.json({ items: [] });

  const items = await prisma.contentItem.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Response.json({ items });
}

export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession();
  if (!session) return Response.json({ error: "not authenticated" }, { status: 401 });

  const { items } = (await req.json()) as { items?: string[] };
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "no items" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
  });
  if (!campaign) return Response.json({ error: "no campaign" }, { status: 404 });

  const clean = items
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 50);

  await prisma.contentItem.createMany({
    data: clean.map((rawText) => ({
      campaignId: campaign.id,
      rawText,
      status: ContentItemStatus.PENDING,
    })),
  });
  return Response.json({ added: clean.length });
}
