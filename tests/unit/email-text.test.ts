import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/email/text";

/**
 * Phase 9 review pass: the plain-text alternative used to strip tags only, so
 * every character reference reached the reader literally ("Sensitive &amp;
 * White"). Text clients and screen readers show that part.
 */
describe("htmlToText", () => {
  it("decodes the references an escaped mail body carries", () => {
    expect(htmlToText("<p>Sensitive &amp; White</p>")).toBe("Sensitive & White");
    expect(htmlToText("<p>Nasmeh&#39;s</p>")).toBe("Nasmeh's");
    expect(htmlToText("<p>Skupaj: 34,99&nbsp;&euro;</p>")).toBe("Skupaj: 34,99 €");
    expect(htmlToText("<p>&#x160;ifra</p>")).toBe("Šifra");
  });

  it("decodes after stripping tags, so a reference spelling a tag stays text", () => {
    expect(htmlToText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe("<script>alert(1)</script>");
  });

  it("drops style and script blocks with their contents", () => {
    expect(htmlToText("<style>.a{color:red}</style><p>Pozdravljeni</p>")).toBe("Pozdravljeni");
    expect(htmlToText("<script>var a = 1 < 2;</script><p>Pozdravljeni</p>")).toBe("Pozdravljeni");
  });

  it("collapses whitespace and trims, one line per block", () => {
    expect(htmlToText("<h1>Naslov</h1>\n\n  <p>Telo   besedila</p>  ")).toBe("Naslov\nTelo besedila");
  });

  it("keeps the mail's structure: blocks and table rows are lines, cells share a line (QA 2026-09-30)", () => {
    const html = `<h1>Hvala za vaše naročilo!</h1><p>Naročilo<br /><strong>NS-2026-00001</strong></p>
      <table><tr><td>1 × Serum</td><td>19,99&nbsp;€</td></tr><tr><td>Popust (koda TEST10)</td><td>−2,00&nbsp;€</td></tr>
      <tr><td>Skupaj</td><td>17,99&nbsp;€</td></tr></table><p>Lep <em>pozdrav</em>, ekipa</p>`;
    expect(htmlToText(html)).toBe(
      "Hvala za vaše naročilo!\nNaročilo\nNS-2026-00001\n1 × Serum 19,99 €\nPopust (koda TEST10) −2,00 €\nSkupaj 17,99 €\nLep pozdrav, ekipa",
    );
  });

  it("keeps link targets a text reader can follow (QA 2026-09-30)", () => {
    expect(htmlToText(`<p><a href="https://sledenje.posta.si/?q=RR1SI&amp;x=1" style="color:#000">Spremljaj pošiljko</a></p>`))
      .toBe("Spremljaj pošiljko: https://sledenje.posta.si/?q=RR1SI&x=1");
    // a label that already shows the target is not repeated
    expect(htmlToText(`<p><a href="https://nasmeh.si/potrdi/abc">https://nasmeh.si/potrdi/abc</a></p>`)).toBe("https://nasmeh.si/potrdi/abc");
    expect(htmlToText(`<p>Pišite na <a href="mailto:info@nasmeh.si">info@nasmeh.si</a>.</p>`)).toBe("Pišite na info@nasmeh.si.");
    // fragments and script URLs keep only the label; nested markup in a label is text
    expect(htmlToText(`<p><a href="#vrh">Na vrh</a> <a href="javascript:x()">X</a> <a href='https://a.si'><strong>A</strong></a></p>`))
      .toBe("Na vrh X A: https://a.si");
  });

  it("leaves an unknown or unsafe reference as written", () => {
    expect(htmlToText("<p>&unknownref; &#0; &#xD800;</p>")).toBe("&unknownref; &#0; &#xD800;");
  });
});
