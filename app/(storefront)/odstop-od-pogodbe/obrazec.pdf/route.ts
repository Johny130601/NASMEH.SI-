import { getSetting, SETTING_KEYS, type CompanySetting } from "@/lib/settings";
import { generateWithdrawalFormPdf } from "@/lib/returns/withdrawal-pdf";
import { returns } from "@/lib/copy/returns";

export const dynamic = "force-dynamic";

/** Downloadable model withdrawal form (§12.4), seller block from the company Setting. */
export async function GET() {
  const company = await getSetting<CompanySetting>(SETTING_KEYS.company);
  const pdf = await generateWithdrawalFormPdf(company);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${returns.withdrawalPdf.filename}"`,
      // Public document; the seller block changes only with settings.
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
