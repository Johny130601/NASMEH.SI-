import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCartLines } from "@/lib/cart/server";
import { getFreeThresholdCents, getMenu, getSetting, SETTING_KEYS } from "@/lib/settings";
import { formatEUR } from "@/lib/pricing";
import { CONTENT_TOKENS, fillToken } from "@/lib/content/tokens";
import { utilityMenuItems } from "@/lib/menus";
import { chrome as copy } from "@/lib/copy/chrome";
import { home } from "@/lib/copy/home";
import { UiMarquee } from "../ui/UiMarquee";
import { UiIcon } from "../ui/UiIcon";
import { CartBadge } from "./CartBadge";
import { MegaMenu, type FeaturedCardData } from "./MegaMenu";
import { MobileDrawer } from "./MobileDrawer";
import { SearchOverlay } from "./SearchOverlay";
import { PURCHASABLE_PRODUCT_WHERE } from "@/lib/cart/visibility";
import { linkIsAvailable, menuHrefs, menuWithAvailableLinks, productSlugsIn } from "@/lib/content-links";

/**
 * Sticky header block (§3.1): marquee (Setting) + utility bar (desktop) +
 * main nav. Single-market chrome: SI only, no region selector. The utility
 * bar and the drawer's footer show the operator's utility menu (QA M16), its
 * sign-in link kept session-aware. No menu link, featured card or marquee
 * link leads to a product page that answers 404 (QA v-a, lib/content-links).
 */
export async function SiteHeader() {
  const [marqueeText, marqueeHref, marqueeActive, freeThresholdCents, headerMenu, mobileMenu, utilityMenu, session] =
    await Promise.all([
      getSetting<string>(SETTING_KEYS.marqueeText),
      getSetting<string>(SETTING_KEYS.marqueeHref),
      getSetting<boolean>(SETTING_KEYS.marqueeActive),
      getFreeThresholdCents(),
      getMenu("header"),
      getMenu("mobile"),
      getMenu("utility"),
      auth(),
    ]);

  // Featured media cards for mega-menu/drawer (slugs from Menu data), and every
  // product page a menu or the marquee links to, checked in one query.
  const featuredSlugs = [
    ...new Set(
      [...headerMenu, ...mobileMenu].flatMap((item) => item.featured ?? []).filter((slug): slug is string => typeof slug === "string"),
    ),
  ];
  const linkedSlugs = productSlugsIn([...menuHrefs(headerMenu), ...menuHrefs(mobileMenu), ...menuHrefs(utilityMenu), marqueeHref]);
  const slugs = [...new Set([...featuredSlugs, ...linkedSlugs])];
  const products = slugs.length
    ? await db.product.findMany({
        // Only products a shopper can buy: drafts, hidden deal SKUs and inactive bundles answer 404 (QA M5/M7).
        where: { slug: { in: slugs }, ...PURCHASABLE_PRODUCT_WHERE },
        select: {
          slug: true,
          title: true,
          media: { where: { kind: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } },
        },
      })
    : [];
  const purchasable = new Set(products.map((product) => product.slug));
  const featured = new Set(featuredSlugs);
  const featuredCards: FeaturedCardData[] = products.filter((product) => featured.has(product.slug)).map((product) => ({
    slug: product.slug,
    title: product.title,
    href: `/izdelek/${product.slug}`,
    imageUrl: product.media[0]?.url ?? null,
    imageAlt: product.media[0]?.alt ?? product.title,
  }));
  const headerItems = menuWithAvailableLinks(headerMenu, purchasable);
  const mobileItems = menuWithAvailableLinks(mobileMenu, purchasable);

  const accountItem = session?.user
    ? { label: copy.utility.account, href: "/racun" }
    : { label: copy.utility.login, href: "/prijava" };
  // The utility bar and the drawer's footer render each item as its own link (no dropdowns).
  const utilityItems = utilityMenuItems(menuWithAvailableLinks(utilityMenu, purchasable, { dropdowns: false }), accountItem);
  // The marquee keeps its text; only a link to a product page that answers 404 is dropped.
  const marqueeLink = marqueeHref && linkIsAvailable(marqueeHref, purchasable) ? marqueeHref : undefined;

  // cart count badge (server-computed: guest cookie or DB cart)
  const cartLines = await getCartLines(session?.user?.id ?? null);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <header className="ui-header sticky top-0 z-40 bg-white">
      {marqueeActive !== false ? (
        <UiMarquee
          // {prag} is the threshold the cart applies, never a typed figure (QA 2026-10-03 T6-05)
          text={fillToken(typeof marqueeText === "string" ? marqueeText : home.marqueeFallback, CONTENT_TOKENS.threshold, formatEUR(freeThresholdCents))}
          href={marqueeLink}
        />
      ) : null}

      {/* Utility bar (desktop only) */}
      <div className="hidden bg-light-3 md:block">
        <div className="mx-auto flex h-10 max-w-(--container-wide) items-center justify-between px-(--padding)">
          <span className="text-xs text-mid-2" aria-label={copy.language}>
            {copy.language}
          </span>
          <nav aria-label={copy.utility.label}>
            <ul className="flex items-center gap-6">
              {utilityItems.map((item) => (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    {...(item.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={`inline-flex min-h-10 items-center gap-2 text-sm transition-colors ${item.color === "sale" ? "text-sale hover:opacity-80" : "text-mid-1 hover:text-dark-1"}`}
                    data-utility-link={item.account ? "account" : undefined}
                  >
                    {item.account ? <UiIcon name="account" className="h-5 w-5" /> : null}
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* Main nav row */}
      <div className="relative border-b border-light-2">
        <div className="mx-auto flex h-16 max-w-(--container-wide) items-center gap-4 px-(--padding) md:h-20">
          <MobileDrawer
            items={mobileItems}
            featuredCards={featuredCards}
            utilityItems={utilityItems}
          />

          <Link
            href="/"
            aria-label={copy.logoAria}
            className="shrink-0 text-xl font-bold tracking-tight text-dark-1 max-md:absolute max-md:left-1/2 max-md:-translate-x-1/2 md:text-2xl"
          >
            {copy.logo}
          </Link>

          <MegaMenu items={headerItems} featuredCards={featuredCards} />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <SearchOverlay />
            <Link
              href="/cart"
              // The visible badge count must be part of the accessible name (WCAG 2.5.3).
              aria-label={cartCount > 0 ? `${copy.cart.open} (${cartCount})` : copy.cart.open}
              data-cart-link
              className="relative flex h-11 w-11 items-center justify-center rounded-btn text-dark-1 transition-colors hover:bg-light-3"
            >
              <UiIcon name="cart" className="h-5 w-5" />
              <CartBadge count={cartCount} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
