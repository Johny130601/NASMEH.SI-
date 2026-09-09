import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { verifyRatingToken } from "@/lib/reviews/rating-token";
import { reviews as copy } from "@/lib/copy";

export const dynamic = "force-dynamic";

/** One-click email star link → full form with the rating prefilled (§10). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = verifyRatingToken(token, getEnv().AUTH_SECRET);
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!payload) return new Response(copy.form.invalidLink, { status: 400, headers });
  return NextResponse.redirect(new URL(`/oceni/${encodeURIComponent(payload.orderItemId)}?r=${encodeURIComponent(token)}`, request.url), { headers });
}
