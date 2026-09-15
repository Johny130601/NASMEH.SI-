import { expect, test } from "@playwright/test";

/** SSR audit (view-source / JS-disabled): everything in the initial HTML. */

test("GET / — chrome + homepage copy in initial HTML", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();

  // marquee + header
  expect(html).toContain("Brezplačna dostava pri naročilih nad 45");
  expect(html).toContain("TRGOVINA");
  expect(html).not.toContain("RAZIŠČI");
  expect(html).toContain("PAKETI &amp; PRIHRANKI");
  expect(html).not.toContain("Center za pomoč");
  expect(html).not.toContain('href="/o-nas"');
  expect(html).not.toContain('href="/dostava"');
  expect(html).toContain("Kontakt");

  // hero (Setting-driven) + rail + banners
  expect(html).toContain("Nasmeh, ki ga opazite");
  // the hero claim marker resolves to a LIVE footnote next to it (Phase 9 step 4, §12.6)
  expect(html).toContain("za svetlejši nasmeh*");
  expect(html).toMatch(/data-hero-footnote="true">\*Rezultati se lahko razlikujejo/);
  expect(html).not.toContain("nežno do sklenine");
  expect(html).toContain("Naše uspešnice");
  expect(html).toContain("Belilni trakci");
  expect(html).toContain("Paket popolna rutina");
  expect(html).toContain("34,99");
  expect(html).toContain("Naši paketi");
  // routine banner legal footnote is LIVE text; its title is original copy
  expect(html).toContain("Rezultati se lahko razlikujejo");
  expect(html).toContain('aria-label="Trakci, ustna voda in serum v enem paketu."');
  expect(html).not.toContain("rutina beljenja — urejena");

  // footer
  expect(html).toContain("Nasmeh.si, d.o.o.");
  expect(html).toContain("Nastavitve piškotkov");
  expect(html).toContain("Prejmite novosti med prvimi");
});

test("GET / — JSON-LD Organization + WebSite(+SearchAction) valid", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">(.*?)<\/script>/gs,
    ),
  ].map((match) => JSON.parse(match[1]) as Record<string, unknown>);

  const organization = blocks.find((b) => b["@type"] === "Organization");
  expect(organization).toBeTruthy();
  expect(organization?.name).toBe("Nasmeh.si");
  expect(organization?.url).toMatch(/^https?:\/\//);

  const website = blocks.find((b) => b["@type"] === "WebSite");
  expect(website).toBeTruthy();
  const action = website?.potentialAction as Record<string, unknown>;
  expect(action?.["@type"]).toBe("SearchAction");
  expect(JSON.stringify(action)).toContain("search_term_string");
});

test("legal page renders with draft notice", async ({ request }) => {
  const response = await request.get("/pogoji-poslovanja");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("Pogoji poslovanja");
  expect(html).toContain("Osnutek dokumenta");
});

test("cookie-policy page renders live cookie table", async ({ request }) => {
  const response = await request.get("/politika-piskotkov");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("Politika piškotkov");
  expect(html).toContain("nasmeh_consent");
  expect(html).toContain("_ga");
});

test("sitemap.xml and robots.txt", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("pogoji-poslovanja");
  expect(xml).toContain("politika-piskotkov");
  // Backlog B1: catalog, visible ACTIVE products (sold-out included) and indexable routes.
  for (const listed of ["/trgovina", "/izdelek/belilni-trakci-za-zobe", "/izdelek/belilni-trakci-potovalni-7", "/prijava-nezelenega-ucinka", "/garancija-vracila-denarja"]) {
    expect(xml, listed).toContain(`${listed}</loc>`);
  }
  for (const retired of ["pomoc", "o-nas", "razisli", "dostava", "paketi"]) {
    expect(xml).not.toContain(`/${retired}</loc>`);
  }
  for (const hidden of ["/cart", "/checkout", "/racun", "/iskanje", "/kontakt", "/sledi", "/prijava", "/odjava-zaloga", "/potrdi", "/admin"]) {
    expect(xml, hidden).not.toContain(`${hidden}</loc>`);
    expect(xml, hidden).not.toContain(`${hidden}/`);
  }

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const txt = await robots.text();
  expect(txt).toContain("Disallow: /cart");
  expect(txt).toContain("Disallow: /checkout");
  expect(txt).toContain("sitemap.xml");
});

test("retired information pages and bundle alias redirect to active destinations", async ({ request }) => {
  const destinations: Record<string, string> = {
    "/pomoc": "/kontakt", "/o-nas": "/", "/razisli": "/",
    "/dostava": "/checkout", "/paketi": "/trgovina?kolekcija=paketi",
  };
  for (const [path, destination] of Object.entries(destinations)) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(response.headers().location, path).toBe(destination);
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test("utility routes carry noindex", async ({ request }) => {
  for (const path of ["/cart", "/checkout", "/racun", "/iskanje"]) {
    const html = await (await request.get(path)).text();
    expect(html.includes('name="robots" content="noindex'), `${path} (including redirects) must carry noindex`).toBe(true);
  }
});

test("404 renders with countdown copy", async ({ request }) => {
  // Route with NO matching segment → static root not-found, fully SSR'd
  // (JS-disabled friendly). Note: notFound() thrown inside a dynamic page
  // (e.g. unknown [slug]) is delivered via RSC + client render — Next.js 15
  // framework behavior; browser coverage is in chrome.spec.ts.
  const response = await request.get("/ta/stran/ne-obstaja");
  expect(response.status()).toBe(404);
  const html = await response.text();
  expect(html).toContain("Strani ni mogoče najti");
  expect(html).toContain("Preusmeritev na domačo stran");
});
