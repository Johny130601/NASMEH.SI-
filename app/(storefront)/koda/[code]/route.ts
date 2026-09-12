import { redirect } from "next/navigation";
import { applyKodaCode } from "@/lib/koda";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * /koda/{CODE} auto-apply (§7.2): format + existence + active validation →
 * session cookie → /cart. Eligibility/discount is evaluated server-side on
 * every cart/checkout read.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  // Codes are short operator strings: bound existence probing per client (Phase 9 step 1).
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const limit = checkRateLimit(`koda:${client}`, 30, 10 * 60_000);
  if (!limit.allowed) return new Response(null, { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) } });
  const { code } = await params;
  const result = await applyKodaCode(code);
  redirect(result.ok ? "/cart" : "/cart?koda=neveljavna");
}
