import { redirect } from "next/navigation";
import { clientAddress } from "@/lib/client-address";
import { applyKodaCode } from "@/lib/koda";
import { kodaCodeSchema } from "@/lib/koda-code";
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
  const limit = checkRateLimit(`koda:${clientAddress(request.headers)}`, 30, 10 * 60_000);
  if (!limit.allowed) return new Response(null, { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) } });
  const { code } = await params;
  const result = await applyKodaCode(code);
  if (result.ok) redirect("/cart");
  // The refusal names the code (QA C2-F2), but only a code-shaped one: the cart
  // never echoes arbitrary text from a link. An active code stays untouched.
  const shown = kodaCodeSchema.safeParse(code);
  redirect(shown.success ? `/cart?koda=neveljavna&vnos=${encodeURIComponent(shown.data)}` : "/cart?koda=neveljavna");
}
