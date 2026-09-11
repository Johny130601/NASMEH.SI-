import { z } from "zod";
import { AdminAccessError, requirePermission } from "@/lib/admin/access";
import { exportCustomerData } from "@/lib/admin/customers";
import { authEmailSchema } from "@/lib/auth-validation";

const idSchema = z.string().trim().min(1).max(64);

export const dynamic = "force-dynamic";

/** GDPR data export (§14.8): the account by id, or a guest by ?email=. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("customers:gdpr");
  } catch (error) {
    if (error instanceof AdminAccessError) return new Response(null, { status: 404 });
    throw error;
  }
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const email = authEmailSchema.safeParse(new URL(request.url).searchParams.get("email") ?? "");
  const data = id.data === "gost"
    ? (email.success ? await exportCustomerData({ email: email.data }) : null)
    : await exportCustomerData({ userId: id.data });
  if (!data) return new Response(null, { status: 404 });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="stranka-${id.data === "gost" ? "gost" : id.data}-${stamp}.json"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
