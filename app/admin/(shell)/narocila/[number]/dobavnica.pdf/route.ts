import { z } from "zod";
import { AdminAccessError, requirePermission } from "@/lib/admin/access";
import { db } from "@/lib/db";
import { generatePackingSlipPdf } from "@/lib/invoice/packing-slip";
import { getCompany } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Packing slip PDF (§14.7): lines and bundle components, no prices. */
export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  try {
    await requirePermission("orders:view");
  } catch (error) {
    if (error instanceof AdminAccessError) return new Response(null, { status: 404 });
    throw error;
  }
  const number = z.string().trim().min(3).max(64).safeParse((await params).number);
  if (!number.success) return new Response(null, { status: 404 });
  const order = await db.order.findUnique({ where: { number: number.data }, include: { items: true } });
  if (!order) return new Response(null, { status: 404 });
  // Validated reader (AGENTS §8.17): a malformed company row prints no seller block rather than a partial one.
  const company = await getCompany();
  const pdf = await generatePackingSlipPdf(order, company);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="dobavnica-${order.number}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
