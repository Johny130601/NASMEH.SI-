import { describe, expect, it } from "vitest";
import { submittedFiles } from "@/lib/form-files";

/** QA 2026-09-29 M1: an untouched file input must never be mistaken for an upload. */
describe("submittedFiles", () => {
  const photo = new File(["image-bytes"], "photo.jpg", { type: "image/jpeg" });

  it("skips the empty part of an untouched input whatever the encoder named it", () => {
    expect(submittedFiles([new File([], "")])).toEqual([]);
    expect(submittedFiles([new File([], "blob", { type: "application/octet-stream" })])).toEqual([]);
    expect(submittedFiles([""])).toEqual([]);
    expect(submittedFiles([])).toEqual([]);
  });

  it("keeps real files, in order, next to empty parts", () => {
    const second = new File(["more"], "second.png", { type: "image/png" });
    expect(submittedFiles([new File([], "blob"), photo, "", second])).toEqual([photo, second]);
  });

  it("refuses a non-empty string part as a malformed upload", () => {
    expect(submittedFiles(["/uploads/other.png"])).toBeNull();
    expect(submittedFiles([photo, "x"])).toBeNull();
  });
});
