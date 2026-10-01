import { describe, expect, it } from "vitest";
import { sanitizeContentHtml } from "@/lib/security/html-sanitizer";
import { LEGAL_PAGES } from "@/prisma/seed-legal";

/**
 * QA 2026-09-29 S1: operator HTML (CMS page bodies, product HTML fields) is rendered
 * on the storefront and in the admin preview — the same origin as /admin — so a
 * MANAGER must not be able to run script or restyle the page around the content.
 */
describe("sanitizeContentHtml", () => {
  it("keeps the formatting the editors use and same-site links", () => {
    const body = `<h2>Naslov</h2><p>Besedilo s <strong>poudarkom</strong>, <em>ležeče</em> in <mark>označeno</mark>.</p><ul><li>ena</li><li>dve</li></ul><p><a href="/kontakt">Kontakt</a> · <a href="https://example.com/x?a=1&amp;b=2">zunanja</a> · <a href="mailto:info@nasmeh.si">pošta</a> · <a href="#odstop">sidro</a></p>`;
    expect(sanitizeContentHtml(body)).toBe(body);
  });

  it("returns every seeded legal draft unchanged (a save of unchanged text must not clear `reviewed`)", () => {
    for (const page of LEGAL_PAGES) {
      expect(sanitizeContentHtml(page.body), page.slug).toBe(page.body);
    }
  });

  it("removes script, event handlers, embedded documents and javascript: URLs", () => {
    const attack = `<p>ok</p><script>alert(1)</script><img src="/x.png" onerror="alert(1)" alt="a"><iframe src="https://evil"></iframe><a href="javascript:alert(1)">klik</a><svg onload="alert(1)"><circle /></svg><object data="x"></object>`;
    const out = sanitizeContentHtml(attack);
    expect(out).toBe(`<p>ok</p><img src="/x.png" alt="a" loading="lazy" /><a>klik</a>`);
    expect(out).not.toMatch(/on\w+=|<script|<iframe|javascript:|<svg|<object/i);
  });

  it("drops class, id, style and data attributes so content cannot overlay or restyle the page", () => {
    const out = sanitizeContentHtml(`<div class="fixed inset-0 z-50" id="x" style="position:fixed;top:0" data-a="1"><p style="display:none">skrito</p></div>`);
    expect(out).toBe(`<div><p>skrito</p></div>`);
  });

  it("refuses protocol-relative and unknown-scheme URLs but keeps https images", () => {
    expect(sanitizeContentHtml(`<a href="//evil.example/x">a</a><a href="ftp://x">b</a><a href="data:text/html,x">c</a>`)).toBe(`<a>a</a><a>b</a><a>c</a>`);
    expect(sanitizeContentHtml(`<img src="https://cdn.example/a.png" alt=""><img src="http://insecure/a.png" alt=""><img src="//evil/a.png" alt="">`))
      .toBe(`<img src="https://cdn.example/a.png" alt="" loading="lazy" /><img alt="" loading="lazy" /><img alt="" loading="lazy" />`);
  });

  it("forces an opener-safe rel on new-tab links and ignores other targets", () => {
    expect(sanitizeContentHtml(`<a href="https://x.si" target="_blank" rel="opener">a</a>`)).toBe(`<a href="https://x.si" target="_blank" rel="noopener noreferrer">a</a>`);
    expect(sanitizeContentHtml(`<a href="/x" target="_top">a</a>`)).toBe(`<a href="/x">a</a>`);
  });

  it("keeps the text of an h1 without the tag (the page owns its <h1>) and closes open tags", () => {
    expect(sanitizeContentHtml(`<h1>Naslov</h1><p>odprt odstavek`)).toBe(`Naslov<p>odprt odstavek</p>`);
    expect(sanitizeContentHtml(`<!-- k --><p>a</p><!-- unclosed`)).toBe(`<p>a</p>`);
  });

  it("escapes text and stray angle brackets", () => {
    expect(sanitizeContentHtml(`5 < 6 & 7 > 3 &amp; &euro;`)).toBe(`5 &lt; 6 &amp; 7 &gt; 3 &amp; &euro;`);
  });
});
