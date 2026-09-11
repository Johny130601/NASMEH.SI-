import QRCode from "qrcode";
import { z } from "zod";
import { AdminAccessError, requirePermission } from "@/lib/admin/access";
import { couponLink } from "@/lib/admin/coupons";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** QR code of the coupon's auto-apply link (§14.4), for print material. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("promos:manage");
  } catch (error) {
    if (error instanceof AdminAccessError) return new Response(null, { status: 404 });
    throw error;
  }
  const id = z.string().trim().min(1).max(64).safeParse((await params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const coupon = await db.coupon.findUnique({ where: { id: id.data }, select: { code: true } });
  if (!coupon) return new Response(null, { status: 404 });
  const svg = await QRCode.toString(couponLink(coupon.code), { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 512 });
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "content-disposition": `inline; filename="koda-${coupon.code}.svg"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
