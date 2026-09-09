import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { ticketAttachment: { findUnique: mocks.find } } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
vi.mock("@/lib/support/photos", () => ({ SUPPORT_UPLOAD_DIR: "/private/support-uploads", SUPPORT_PHOTO_FILENAME: /^[a-f0-9]{24}\.webp$/ }));
import { GET } from "@/app/api/support/attachments/[id]/route";
const filename = `${"a".repeat(24)}.webp`;
const attachment = () => ({ id: "attachment-1", filename, size: 4, ticket: { userId: "reporter", reference: "SUP-1" } });
const get = (id = "attachment-1") => GET(new Request("https://example.test/api/support/attachments/id"), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "reporter", role: "CUSTOMER" } }); mocks.find.mockResolvedValue(attachment()); mocks.read.mockResolvedValue(Buffer.from("webp")); });

describe("private support attachment access", () => {
  it.each([{ id: "reporter", role: "CUSTOMER" }, { id: "staff", role: "ADMIN" }])("allows the reporting account or admin and serves generated WebP inline", async user => {
    mocks.auth.mockResolvedValue({ user });
    const response = await get(); expect(response.status).toBe(200); expect(await response.text()).toBe("webp");
    expect(response.headers.get("content-type")).toBe("image/webp"); expect(response.headers.get("content-disposition")).toBe(`inline; filename="${filename}"`);
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.find).toHaveBeenCalledWith({ where: { id: "attachment-1" }, include: { ticket: { select: { userId: true, reference: true } } } });
    expect(mocks.read).toHaveBeenCalledWith(`/private/support-uploads/${filename}`);
  });
  it("denies unauthenticated access without consulting the file store", async () => {
    mocks.auth.mockResolvedValue(null); const response = await get(); expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("denies a different customer even when that customer owns the referenced order", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "order-owner", role: "CUSTOMER" } });
    mocks.find.mockResolvedValue({ ...attachment(), ticket: { ...attachment().ticket, order: { userId: "order-owner" } } });
    expect((await get()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("makes guest-reported attachments staff-only, without inferring ownership from account email", async () => {
    mocks.find.mockResolvedValue({ ...attachment(), ticket: { userId: null, reference: "SUP-guest" } });
    expect((await get()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ user: { id: "staff", role: "ADMIN" } }); expect((await get()).status).toBe(200);
  });
  it.each(["../.env", "id/other", "bad_name", "x".repeat(129), ""])("rejects malformed IDs before authentication or lookup", async id => {
    expect((await get(id)).status).toBe(404); expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not trust an unsafe persisted filename", async () => {
    mocks.find.mockResolvedValue({ ...attachment(), filename: "../../.env" }); expect((await get()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not serve orphaned files after attachment removal", async () => {
    mocks.find.mockResolvedValue(null); expect((await get()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns private 404 for a missing file and propagates real storage failures", async () => {
    mocks.read.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" })); expect((await get()).status).toBe(404);
    const failure = Object.assign(new Error("disk error"), { code: "EIO" }); mocks.read.mockRejectedValueOnce(failure); await expect(get()).rejects.toBe(failure);
  });
});
