import { AdminAccessError, requirePermission } from "@/lib/admin/access";
import { ordersCsv, parseOrderFilters } from "@/lib/admin/orders";

export const dynamic = "force-dynamic";

/** CSV export of the filtered order list (§14.7); staff with orders:view only. */
export async function GET(request: Request) {
  try {
    await requirePermission("orders:view");
  } catch (error) {
    if (error instanceof AdminAccessError) return new Response(null, { status: 404 });
    throw error;
  }
  const query: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) query[key] = value;
  const csv = await ordersCsv(parseOrderFilters(query));
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="narocila-${stamp}.csv"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
