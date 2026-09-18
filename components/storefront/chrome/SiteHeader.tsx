import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCartLines } from "@/lib/cart/server";
import { getMenu, getSetting, SETTING_KEYS } from "@/lib/settings";
import { chrome as copy, home } from "@/lib/copy";
import { UiMarquee } from "../ui/UiMarquee";
import { UiIcon } from "../ui/UiIcon";
import { MegaMenu, type FeaturedCardData } from "./MegaMenu";
import { MobileDrawer } from "./MobileDrawer";
import { SearchOverlay } from "./SearchOverlay";

/**
 * Sticky header block (§3.1): marquee (Setting) + utility bar (desktop) +
 * main nav. Single-market chrome: SI only, no region selector.
 */
export async function SiteHeader() {
  const [marqueeText, marqueeHref, marqueeActive, headerItems, mobileItems, session] =
    await Promise.all([
      getSetting<string>(SETTING_KEYS.marqueeText),
      getSetting<string>(SETTING_KEYS.marqueeHref),
      getSetting<boolean>(SETTING_KEYS.marqueeActive),
      getMenu("header"),
      getMenu("mobile"),
      auth(),
    ]);

  // Featured media cards for mega-menu/drawer (slugs from Menu data)
  const featuredSlugs = [
    ...new Set(
      [...headerItems, ...mobileItems].flatMap((item) => item.featured ?? []),
    ),
  ];
  const featuredProducts = featuredSlugs.length
    ? await db.product.findMany({
        where: { slug: { in: featuredSlugs }, status: "ACTIVE" },
        include: {
          media: { where: { kind: "CARD" }, orderBy: { sortOrder: "asc" }, take: 1 },
        },
      })
    : [];
  const featuredCards: FeaturedCardData[] = featuredProducts.map((product) => ({
    slug: product.slug,
    title: product.title,
    href: `/izdelek/${product.slug}`,
    imageUrl: product.media[0]?.url ?? null,
    imageAlt: product.media[0]?.alt ?? product.title,
  }));

  const accountItem = session?.user
    ? { label: copy.utility.account, href: "/racun" }
    : { label: copy.utility.login, href: "/prijava" };

  // cart count badge (server-computed: guest cookie or DB cart)
  const cartLines = await getCartLines(session?.user?.id ?? null);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <header className="ui-header sticky top-0 z-40 bg-white">
      {marqueeActive !== false ? (
        <UiMarquee
          text={marqueeText ?? home.marqueeFallback}
          href={marqueeHref || undefined}
        />
      ) : null}

      {/* Utility bar (desktop only) */}
      <div className="hidden bg-light-3 md:block">
        <div className="mx-auto flex h-10 max-w-(--container-wide) items-center justify-between px-(--padding)">
          <span className="text-xs text-mid-2" aria-label={copy.language}>
            {copy.language}
          </span>
          <nav aria-label={copy.utility.label}>
            <Link href={accountItem.href} className="inline-flex min-h-10 items-center gap-2 text-sm text-mid-1 transition-colors hover:text-dark-1">
              <UiIcon name="account" className="h-5 w-5" />
              {accountItem.label}
            </Link>
          </nav>
        </div>
      </div>

      {/* Main nav row */}
      <div className="relative border-b border-light-2">
        <div className="mx-auto flex h-16 max-w-(--container-wide) items-center gap-4 px-(--padding) md:h-20">
          <MobileDrawer
            items={mobileItems}
            featuredCards={featuredCards}
            utilityItems={[accountItem]}
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
              {cartCount > 0 ? (
                // keyed by the count so every change pops the badge (research 06 §10 cart dot)
                <span
                  key={cartCount}
                  data-cart-badge
                  className="absolute right-0 top-0 flex h-5 min-w-5 animate-pop items-center justify-center rounded-btn bg-brand px-1 text-xs font-medium leading-none text-white"
                >
                  {cartCount}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
