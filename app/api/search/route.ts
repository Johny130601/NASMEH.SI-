import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { MAINTENANCE_COOKIE, isValidMaintenanceCookie } from "@/lib/maintenance";
import { parseSearchQuery, searchProducts } from "@/lib/search";
import { getMaintenance } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Instant search endpoint (§3.1) — zod-validated input (AGENTS §8.2). */
export async function GET(request: Request) {
  const query = parseSearchQuery(
    new URL(request.url).searchParams.get("q"),
  );
  // The middleware matcher skips /api, so the maintenance gate (§3.6) is applied
  // here: a locked store answers no catalog questions — slug, title, price and
  // stock for a two-letter query were public on a "locked" staging.
  const products = query.length < 2 || (await isLocked()) ? [] : await searchProducts(query, 6);
  // The overlay renders a row per product: only what it shows leaves the server.
  const results = products.map((product) => ({
    slug: product.slug,
    title: product.title,
    priceCents: product.priceCents,
    imageUrl: product.imageUrl,
    imageAlt: product.imageAlt,
    soldOut: product.soldOut,
  }));
  return NextResponse.json({ results });
}

/** Locked for everyone but a visitor who passed the gate (same check as the middleware). */
async function isLocked(): Promise<boolean> {
  const setting = await getMaintenance();
  if (!setting.enabled) return false;
  const token = (await cookies()).get(MAINTENANCE_COOKIE)?.value;
  return !isValidMaintenanceCookie(token, getEnv().AUTH_SECRET, setting.passwordHash);
}
