import { z } from "zod";
import { isStaffRole } from "@/lib/admin/permissions";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildInvoiceDataWithCompany } from "@/lib/invoice/data";
import { generateInvoicePdf } from "@/lib/invoice/pdf";
import { hasIssuedInvoice } from "@/lib/account/order-view";

export const dynamic = "force-dynamic";

/** Invoice PDF download (§11.2) — owner or admin only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await auth();
  if (!session?.user) redirect("/prijava");

  // Bounded, not shaped: order numbers are NS-YYYY-NNNNN in production, test fixtures are longer.
  const number = z.string().trim().min(3).max(64).safeParse((await params).number);
  if (!number.success) notFound();
  const order = await db.order.findUnique({
    where: { number: number.data },
    include: { items: true },
  });
  if (!order) notFound();
  if (order.userId !== session.user.id && !isStaffRole(session.user.role)) {
    notFound();
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
