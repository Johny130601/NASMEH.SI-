import { z } from "zod";
import { clientAddress } from "@/lib/client-address";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Browsers post a `csp-report` object (report-uri); the Reporting API posts an array of reports. */
const reportSchema = z.object({
  "document-uri": z.string().max(2048).optional(),
  "violated-directive": z.string().max(200).optional(),
  "effective-directive": z.string().max(200).optional(),
  "blocked-uri": z.string().max(2048).optional(),
  "source-file": z.string().max(2048).optional(),
  "line-number": z.number().int().optional(),
  disposition: z.string().max(20).optional(),
}).loose();

const bodySchema = z.union([
  z.object({ "csp-report": reportSchema }).transform((value) => [value["csp-report"]]),
  z.array(z.object({ body: reportSchema }).loose()).max(20).transform((value) => value.map((entry) => entry.body)),
]);

const MAX_BYTES = 16 * 1024;

/** Storefront routes whose next path segment is a secret link token (e-mail confirmation, reset, unsubscribe, rating). */
const TOKEN_PARENTS = new Set(["potrdi", "potrdi-racun", "potrdi-zalogo", "ponastavi-geslo", "odjava-zaloga", "odjava-novice", "hitro"]);
const LONG_OPAQUE_SEGMENT = /^(?=.*\d)[A-Za-z0-9_.~-]{32,}$/;

/**
 * Report URIs are reduced before logging (GDPR Art. 5(1)(c)): origin and path
 * only, so query strings such as the admin guest page's ?email= never reach the
 * log, token path segments are masked, and non-HTTP schemes (data:, blob:) keep
 * the scheme alone. CSP keywords ("inline", "eval") pass through.
 */
function reportUri(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return /^[a-z][a-z-]{0,39}$/i.test(value) ? value : "[invalid]";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return url.protocol;
  const segments = url.pathname.split("/");
  const path = segments.map((segment, index) =>
    (index > 0 && TOKEN_PARENTS.has(segments[index - 1]) && segment) || LONG_OPAQUE_SEGMENT.test(segment) ? ":token" : segment,
  ).join("/");
  return `${url.origin}${path}`;
}

/**
 * CSP violation sink (Phase 9 step 1): one compact log line per report so a
 * report-only policy can be read from the server log before it is enforced.
 * Never echoes the body, never stores it, rate-limited per client.
 */
export async function POST(request: Request): Promise<Response> {
  if (!checkRateLimit(`csp-report:${clientAddress(request.headers)}`, 60, 60_000).allowed) return new Response(null, { status: 429 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return new Response(null, { status: 413 });
  let parsed;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) return new Response(null, { status: 413 });
    parsed = bodySchema.safeParse(JSON.parse(text));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success) return new Response(null, { status: 400 });
  for (const report of parsed.data) {
    console.warn(
      `[csp] ${report.disposition ?? "report"} ${report["effective-directive"] ?? report["violated-directive"] ?? "?"} blocked=${reportUri(report["blocked-uri"], "?")} page=${reportUri(report["document-uri"], "?")} source=${reportUri(report["source-file"], "-")}:${report["line-number"] ?? "-"}`,
    );
  }
  return new Response(null, { status: 204 });
}
