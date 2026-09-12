import { z } from "zod";
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

/**
 * CSP violation sink (Phase 9 step 1): one compact log line per report so a
 * report-only policy can be read from the server log before it is enforced.
 * Never echoes the body, never stores it, rate-limited per client.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  if (!checkRateLimit(`csp-report:${ip}`, 60, 60_000).allowed) return new Response(null, { status: 429 });
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
      `[csp] ${report.disposition ?? "report"} ${report["effective-directive"] ?? report["violated-directive"] ?? "?"} blocked=${report["blocked-uri"] ?? "?"} page=${report["document-uri"] ?? "?"} source=${report["source-file"] ?? "-"}:${report["line-number"] ?? "-"}`,
    );
  }
  return new Response(null, { status: 204 });
}
