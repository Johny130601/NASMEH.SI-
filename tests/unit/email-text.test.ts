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

  it("collapses whitespace and trims", () => {
    expect(htmlToText("<h1>Naslov</h1>\n\n  <p>Telo   besedila</p>  ")).toBe("Naslov Telo besedila");
  });

  it("leaves an unknown or unsafe reference as written", () => {
    expect(htmlToText("<p>&unknownref; &#0; &#xD800;</p>")).toBe("&unknownref; &#0; &#xD800;");
  });
});
