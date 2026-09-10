import { AdminAccessError, requirePermission } from "@/lib/admin/access";
import { exportCustomerData } from "@/lib/admin/customers";

export const dynamic = "force-dynamic";

/** GDPR data export (§14.8): the account by id, or a guest by ?email=. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("customers:gdpr");
  } catch (error) {
    if (error instanceof AdminAccessError) return new Response(null, { status: 404 });
    throw error;
  }
  const { id } = await params;
  const email = new URL(request.url).searchParams.get("email");
  const data = id === "gost"
    ? (email ? await exportCustomerData({ email }) : null)
    : await exportCustomerData({ userId: id });
  if (!data) return new Response(null, { status: 404 });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="stranka-${id === "gost" ? "gost" : id}-${stamp}.json"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
