import Link from "next/link";
import { getEnv } from "@/lib/env";
import { isTestMode } from "@/lib/turnstile";
import {
  getCompany,
  getLegalLinks,
} from "@/lib/settings";
import { footerColumnTitle, getMenuWithTitle, withLegalLinks } from "@/lib/menus";
import { menuHrefs, menuWithAvailableLinks, productSlugsIn, purchasableSlugs } from "@/lib/content-links";
import { admin } from "@/lib/copy/admin";
import { footer as copy } from "@/lib/copy/footer";
import { telHref } from "@/lib/phone";
import { NewsletterForm } from "./NewsletterForm";
import { CmpOpenButton } from "../cmp/CmpOpenButton";
import { PaymentIcons } from "../ui/PaymentIcons";
import { UiIcon } from "../ui/UiIcon";

const COLUMNS = [
  { handle: "footer-trgovina", title: copy.columns.shop },
  { handle: "footer-pomoc", title: copy.columns.help },
  { handle: "footer-sledite", title: copy.columns.follow },
] as const;

/** Site footer (§3.2): capture block, menu columns (mobile accordions),
 *  payment row, company block, legal links + CMP reopen. Column headings are
 *  the menus' titles (QA T7-F3) and links to the legal pages follow the
 *  `legal.links` mapping (QA T7-F21). A link to a product page that answers
 *  404 is left out (QA v-a, lib/content-links). */
export async function SiteFooter() {
  const [company, legalLinks, legalMenu, ...columnMenus] = await Promise.all([
    // Validated reader: a malformed row shows no block rather than a partial identity.
    getCompany(),
    getLegalLinks(),
    getMenuWithTitle("footer-pravno"),
    ...COLUMNS.map((col) => getMenuWithTitle(col.handle)),
  ]);
  const linkedItems = [legalMenu.items, ...columnMenus.map((menu) => menu?.items ?? [])].map((items) => withLegalLinks(items, legalLinks));
  const purchasable = await purchasableSlugs(productSlugsIn(linkedItems.flatMap((items) => menuHrefs(items))));
  // Every footer item renders as its own link (no dropdowns), so a dead link goes whatever its children.
  const [legalItems, ...columnItems] = linkedItems.map((items) => menuWithAvailableLinks(items, purchasable, { dropdowns: false }));
  const columns = COLUMNS.map((col, index) => ({
    handle: col.handle,
    title: footerColumnTitle(columnMenus[index]?.title ?? "", admin.content.menus.handles[col.handle], col.title),
    items: columnItems[index] ?? [],
  }));

  const phoneHref = company?.phone ? telHref(company.phone) : null;
  const env = getEnv();
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
  const testToken = isTestMode() ? (env.TURNSTILE_TEST_TOKEN ?? null) : null;

  return (
    <footer className="border-t border-light-2 bg-white">
      {/* Email capture block */}
      <div className="border-b border-light-3">
        <div className="mx-auto max-w-(--container-narrow) px-(--padding) py-12">
          <h2 className="text-2xl md:text-[2rem]">{copy.newsletter.title}</h2>
          <p className="mt-2 max-w-lg text-sm text-mid-1">{copy.newsletter.hook}</p>
          <div className="mt-6 max-w-xl">
            <NewsletterForm siteKey={siteKey} testToken={testToken} privacyHref={legalLinks.privacy} />
          </div>
        </div>
      </div>

      {/* Link columns: grid on desktop, accordions on mobile */}
      <div className="mx-auto max-w-(--container-wide) px-(--padding) py-10">
        <div className="grid gap-2 md:grid-cols-3 md:gap-10">
          {columns.map((col) => {
            const items = col.items;
            const list = (
              <ul className="flex flex-col gap-2.5 pb-4 md:pb-0">
                {items.map((item) => {
                  const external = item.href.startsWith("http");
                  return (
                    <li key={item.href + item.label}>
                      <Link
                        href={item.href}
                        {...(external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-sm text-mid-1 transition-colors hover:text-dark-1"
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            );
            return (
              <div key={col.handle} className="border-b border-light-3 md:border-none">
                <h3 className="hidden pb-4 text-sm font-medium uppercase tracking-[0.1em] text-dark-1 md:block">
                  {col.title}
                </h3>
                <details className="group py-4 md:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium uppercase tracking-[0.1em] text-dark-1 [&::-webkit-details-marker]:hidden">
                    {col.title}
                    <UiIcon name="chevron-down" className="h-4 w-4 transition-transform group-open:rotate-180" />
                  </summary>
                  {list}
                </details>
                <div className="hidden md:block">{list}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment icons */}
      <div className="mx-auto max-w-(--container-wide) px-(--padding) pb-8">
        <PaymentIcons label={copy.payments} klarnaEnabled={env.STRIPE_KLARNA_ENABLED === "true"} />
      </div>

      {/* Company identification + legal */}
      <div className="border-t border-light-3 bg-light-4">
        <div className="mx-auto max-w-(--container-wide) px-(--padding) py-8">
          {company ? (
            <address className="text-xs not-italic leading-6 text-mid-2">
              <span className="font-medium text-dark-1">{company.name}</span>
              <br />
              {company.address}
              <br />
              {copy.company.registration}: {company.registrationNumber} ·{" "}
              {copy.company.vat}: {company.vatId}
              <br />
              {copy.company.email}:{" "}
              <a
                href={`mailto:${company.email}`}
                className="underline underline-offset-2 transition-colors hover:text-dark-1"
              >
                {company.email}
              </a>
              {phoneHref && company.phone ? (
                <>
                  {" · "}
                  {copy.company.phone}:{" "}
                  <a
                    href={phoneHref}
                    className="underline underline-offset-2 transition-colors hover:text-dark-1"
                    data-company-phone
                  >
                    {company.phone.trim()}
                  </a>
                </>
              ) : null}
            </address>
          ) : null}

          <nav aria-label={copy.columns.legal} className="mt-6">
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {legalItems.map((item) => (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    className="text-xs text-mid-2 underline underline-offset-2 transition-colors hover:text-dark-1"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <CmpOpenButton />
              </li>
            </ul>
          </nav>

          <p className="mt-6 text-xs text-mid-3">{copy.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
