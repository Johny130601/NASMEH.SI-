import { redirect } from "next/navigation";
import { applyKodaCode } from "@/lib/koda";

/**
 * /koda/{CODE} auto-apply (§7.2): format + existence + active validation →
 * session cookie → /cart. Eligibility/discount is evaluated server-side on
 * every cart/checkout read.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const result = await applyKodaCode(code);
  redirect(result.ok ? "/cart" : "/cart?koda=neveljavna");
}
