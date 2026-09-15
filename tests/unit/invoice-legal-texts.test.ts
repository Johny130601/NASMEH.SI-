import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  generateLegalTextsPdf,
  htmlToTextBlocks,
  legalTextSource,
  readLegalAcceptance,
  type LegalTextDocument,
} from "@/lib/invoice/legal-texts-pdf";

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const cp = (code: number) => String.fromCodePoint(code);

describe("HTML character references in the legal-texts PDF", () => {
  it("decodes the named references Slovenian legal text pasted from Word or another CMS carries", () => {
    expect(decodeEntities("&Scaron;tevilka &scaron;t. &Ccaron;&ccaron; &Zcaron;&zcaron; &sect; 5 &rsquo;x&lsquo; &bdquo;a&ldquo; &eacute; &euro;"))
      .toBe("Številka št. Čč Žž § 5 ’x‘ „a“ é €");
  });

  it("is case-sensitive like a browser and leaves an unknown name literal", () => {
    expect(decodeEntities("&Scaron;&scaron;")).toBe("Šš");
    expect(decodeEntities("&SCARON; &nonsense; &amp")).toBe("&SCARON; &nonsense; &amp");
    expect(decodeEntities("&AMP; &LT;&GT; &QUOT;")).toBe("& <> \"");
  });

  it("decodes only once: an escaped reference stays visible as text", () => {
    expect(decodeEntities("&amp;scaron; &amp;#269;")).toBe("&scaron; &#269;");
  });

  it("covers the whole Latin-1 Supplement and Latin Extended-A in code-point order", () => {
    expect(decodeEntities("&iexcl;&sect;&divide;&times;&yuml;&THORN;&szlig;")).toBe(cp(0xa1) + cp(0xa7) + cp(0xf7) + cp(0xd7) + cp(0xff) + cp(0xde) + cp(0xdf));
    expect(decodeEntities("&Amacr;&dstrok;&Gcedil;&Idot;&imath;&kgreen;&lstrok;&napos;&eng;&Odblac;&oelig;&Scaron;&tstrok;&Yuml;&zcaron;"))
      .toBe([0x100, 0x111, 0x122, 0x130, 0x131, 0x138, 0x142, 0x149, 0x14b, 0x150, 0x153, 0x160, 0x167, 0x178, 0x17e].map(cp).join(""));
    expect(decodeEntities("&Alpha;&Omega;&alpha;&sigmaf;&omega;&fnof;")).toBe([0x391, 0x3a9, 0x3b1, 0x3c2, 0x3c9, 0x192].map(cp).join(""));
  });

  it("decodes common punctuation and symbols", () => {
    expect(decodeEntities("&ndash;&mdash;&hellip;&bull;&dagger;&permil;&prime;&lsaquo;&rsaquo;&trade;&reg;&copy;&deg;&plusmn;&frac12;&le;&ge;&ne;&minus;&rarr;&numero;"))
      .toBe([0x2013, 0x2014, 0x2026, 0x2022, 0x2020, 0x2030, 0x2032, 0x2039, 0x203a, 0x2122, 0xae, 0xa9, 0xb0, 0xb1, 0xbd, 0x2264, 0x2265, 0x2260, 0x2212, 0x2192, 0x2116].map(cp).join(""));
  });

  it("prints plain spaces for typographic spaces and drops invisible format characters", () => {
    expect(decodeEntities("a&nbsp;b&thinsp;c&emsp;d")).toBe("a b c d");
    expect(decodeEntities("de&shy;li&zwnj;te&zwj;x&lrm;&rlm;")).toBe("delitex");
  });

  it("decodes decimal and hex references, with 0x80–0x9F read as Windows-1252 and invalid ones dropped", () => {
    expect(decodeEntities("&#269;&#x10D;&#X10c;&#x1F600;")).toBe("ččČ" + cp(0x1f600));
    expect(decodeEntities("&#138;&#142;&#150;&#146;&#147;&#148;&#128;&#154;&#158;")).toBe("ŠŽ–’“”€šž");
    expect(decodeEntities("[&#0;][&#xD800;][&#x110000;][&#129;][&#99999999999;]")).toBe("[][][][][]");
  });

  it("applies the decoding inside CMS bodies", () => {
    expect(htmlToTextBlocks("<h2>&sect; 1 Splo&scaron;no</h2><p>Potro&scaron;nik ima pravico &ndash; v 14 dneh&hellip;</p><ul><li>&bdquo;Izdelek&ldquo;</li></ul>")).toEqual([
      { kind: "heading", text: "§ 1 Splošno" },
      { kind: "paragraph", text: "Potrošnik ima pravico – v 14 dneh…" },
      { kind: "item", text: "„Izdelek“" },
    ]);
  });
});

describe("which text the legal-texts PDF prints", () => {
  const acceptedBody = "<h2>1. Splošno</h2><p>Različica ob oddaji</p>";
  const liveBody = "<h2>1. Splošno</h2><p>Kasneje spremenjeno</p>";
  const liveUpdatedAt = new Date("2026-09-20T10:00:00Z");

  function document(accepted: Record<string, unknown> | null, page: LegalTextDocument["page"] = { title: "Pogoji (nova)", body: liveBody, updatedAt: liveUpdatedAt }): LegalTextDocument {
    return {
      key: "terms", title: "Pogoji poslovanja", url: "https://nasmeh.test/pogoji-poslovanja", page,
      accepted: accepted ? readLegalAcceptance({ acceptedAt: "2026-09-13T10:00:00.000Z", pages: [{ key: "terms", ...accepted }] }).get("terms") ?? null : null,
    };
  }

  it("prints the body stored at placement, not the page as edited since", () => {
    const source = legalTextSource(document({ slug: "pogoji-poslovanja", updatedAt: "2026-09-01T08:00:00.000Z", sha256: sha(acceptedBody), title: "Pogoji poslovanja", body: acceptedBody }));
    expect(source).toEqual({
      title: "Pogoji poslovanja", body: acceptedBody, updatedAt: new Date("2026-09-01T08:00:00.000Z"), origin: "accepted", changedSinceAcceptance: false,
    });
  });

  it("prints the stored body even when the page is no longer published", () => {
    const source = legalTextSource(document({ sha256: sha(acceptedBody), title: null, body: acceptedBody, updatedAt: null }, null));
    expect(source).toMatchObject({ title: "Pogoji poslovanja", body: acceptedBody, updatedAt: null, origin: "accepted" });
  });

  it("keeps today's fallback for orders placed before bodies were stored: live page plus the changed marker", () => {
    expect(legalTextSource(document({ sha256: sha(acceptedBody), updatedAt: "2026-09-01T08:00:00.000Z" }))).toEqual({
      title: "Pogoji (nova)", body: liveBody, updatedAt: liveUpdatedAt, origin: "live", changedSinceAcceptance: true,
    });
    expect(legalTextSource(document({ sha256: sha(liveBody) }))).toMatchObject({ origin: "live", changedSinceAcceptance: false });
    expect(legalTextSource(document(null))).toMatchObject({ origin: "live", changedSinceAcceptance: false });
  });

  it("does not trust a stored body that no longer matches its hash", () => {
    expect(legalTextSource(document({ sha256: sha(acceptedBody), body: "<p>podtaknjeno</p>" }))).toMatchObject({ origin: "live", body: liveBody, changedSinceAcceptance: true });
  });

  it("reports a missing text only when neither a stored body nor a live page exists", () => {
    expect(legalTextSource(document({ sha256: null, body: null }, null))).toEqual({
      title: "Pogoji poslovanja", body: null, updatedAt: null, origin: "missing", changedSinceAcceptance: false,
    });
  });

  it("renders a PDF from a stored body without a live page", async () => {
    const pdf = await generateLegalTextsPdf({
      orderNumber: "NS-2026-00042", preparedAt: new Date("2026-09-13T10:00:00Z"),
      documents: [document({ sha256: sha(acceptedBody), title: "Pogoji poslovanja", body: acceptedBody, updatedAt: "2026-09-01T08:00:00.000Z" }, null)],
    });
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw.match(/\/Type \/Page\b/g)?.length).toBe(1);
  });
});
