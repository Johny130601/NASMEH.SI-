import { getCompany } from "@/lib/settings";
import { generateWithdrawalFormPdf } from "@/lib/returns/withdrawal-pdf";
import { returns } from "@/lib/copy/returns";

export const dynamic = "force-dynamic";

/** Downloadable model withdrawal form (§12.4), seller block from the validated company Setting. */
export async function GET() {
  const company = await getCompany();
  if (!company) {
    // Fail closed: a form without the seller's name, address and e-mail is not the model form.
    console.error("Withdrawal form unavailable: company Setting missing or invalid");
    return new Response(null, {
      status: 503,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
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
