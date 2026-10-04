import { z } from "zod";
import { AdminAccessError, requirePermission } from "@/lib/admin/access";
import { notFound, redirect } from "next/navigation";
import { signInPath } from "@/lib/auth-callback";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildInvoiceDataWithCompany } from "@/lib/invoice/data";
import { generateInvoicePdf } from "@/lib/invoice/pdf";
import { hasIssuedInvoice } from "@/lib/account/order-view";

export const dynamic = "force-dynamic";

/** Invoice PDF download (§11.2) — the order's owner, or staff re-checked as on every admin route (§8.7). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const raw = (await params).number;
  const session = await auth();
  // back to the order after signing in (QA 2026-10-03 V2-02); signInPath keeps it a same-site path
  if (!session?.user) redirect(signInPath(`/racun/narocilo/${encodeURIComponent(raw)}`));

  // Bounded, not shaped: order numbers are NS-YYYY-NNNNN in production, test fixtures are longer.
  const number = z.string().trim().min(3).max(64).safeParse(raw);
  if (!number.success) notFound();
  const order = await db.order.findUnique({
    where: { number: number.data },
    include: { items: true },
  });
  if (!order) notFound();
  if (order.userId !== session.user.id) {
    // Buyer data for staff only with the permission and an enrolled second factor; every refusal is a 404.
    try {
      await requirePermission("orders:view");
    } catch (error) {
      if (error instanceof AdminAccessError) notFound();
      throw error;
    }
  }
  if (!hasIssuedInvoice(order)) notFound();

  const data = await buildInvoiceDataWithCompany(order);
  const pdf = await generateInvoicePdf(data);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="racun-${order.number}.pdf"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
