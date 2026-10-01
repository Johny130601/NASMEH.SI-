/**
 * The files a multipart form really carries — PURE, shared by every upload
 * action (reviews, contact, adverse-event report).
 *
 * An untouched `<input type="file">` still submits one empty part: browsers
 * send an unnamed 0-byte File, the Server Action encoder re-wraps it as a
 * 0-byte File named "blob", and some decoders hand it over as an empty string.
 * A 0-byte part carries no upload whatever its name, so it is skipped; any
 * other string part means the request was not a file upload at all (`null`).
 */
export function submittedFiles(values: FormDataEntryValue[]): File[] | null {
  const files: File[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      if (value === "") continue;
      return null;
    }
    if (value.size === 0) continue;
    files.push(value);
  }
  return files;
}
