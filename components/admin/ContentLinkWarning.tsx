import type { ContentLinkPlace } from "@/lib/admin/cms";
import type { UnavailableFeatured, UnavailableLink, UnavailableReason } from "@/lib/content-links";
import { admin as copy } from "@/lib/copy/admin";

/**
 * Warnings about operator links to a product page that answers 404 (QA 2026-09-30, v-a): the product
 * is a draft, archived, a hidden deal SKU or a withdrawn bundle, and the storefront leaves the link
 * out. The editors show them next to the save status, never in place of it. Type-only imports keep
 * the server modules out of the client bundle.
 */

const c = copy.content.links;

export function reasonLabel(reason: UnavailableReason): string {
  return c.reasons[reason];
}

/** "link (reason), …" in one of the content.links templates. */
export function unavailableLinksText(template: string, links: UnavailableLink[]): string {
  return template.replace("{links}", links.map((link) => `${link.href} (${reasonLabel(link.reason)})`).join(", "));
}

/** "slug (reason), …" in a template with {slugs}: the menu save's refusal and the editor's warning on load. */
export function unavailableFeaturedText(template: string, featured: UnavailableFeatured[]): string {
  return template.replace("{slugs}", featured.map((entry) => `${entry.slug} (${reasonLabel(entry.reason)})`).join(", "));
}

export function contentLinkPlaceLabel(place: ContentLinkPlace): string {
  return place in c.places
    ? c.places[place as keyof typeof c.places]
    : copy.content.menus.handles[place as keyof typeof copy.content.menus.handles];
}

/** The places that still link to a product a save took off sale or renamed. */
export function linkPlacesText(places: ContentLinkPlace[]): string {
  return c.product.replace("{places}", places.map(contentLinkPlaceLabel).join(", "));
}

export function ContentLinkWarning({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="status" className="rounded-card border border-warning bg-white p-3 text-sm text-dark-1" data-content-link-warning>
      {text}
    </p>
  );
}
