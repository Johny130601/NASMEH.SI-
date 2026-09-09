import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { review: { findFirst: mocks.find } } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
vi.mock("@/lib/reviews/photo-storage", () => ({ REVIEW_UPLOAD_DIR: "/private/review-uploads" }));
import { GET } from "@/app/uploads/reviews/[filename]/route";
const name = `${"a".repeat(24)}.webp`;
const get = (filename = name) => GET(new Request(`https://example.test/uploads/reviews/${filename}`), { params: Promise.resolve({ filename }) });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(null); mocks.find.mockResolvedValue({ status: "PUBLISHED", userId: "owner", orderItem: { order: { userId: "owner" } } }); mocks.read.mockResolvedValue(Buffer.from("webp-image")); });
describe("moderation-aware runtime photo serving", () => {
  it("serves only an attached published image, with no-store and nosniff", async () => {
    const response = await get(); expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp"); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("matches thumbnail authorization to its original review attachment", async () => {
    expect((await get(name.replace(".webp", "-320.webp"))).status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { photos: { array_contains: [`/uploads/reviews/${name}`] } } }));
  });
  it.each(["PENDING", "REJECTED"])("denies anonymous and other-user access to %s images", async (status) => {
    mocks.find.mockResolvedValue({ status, userId: "owner", orderItem: null });
    expect((await get()).status).toBe(404);
    mocks.auth.mockResolvedValue({ user: { id: "other", role: "CUSTOMER" } });
    expect((await get()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([{ id: "admin", role: "ADMIN" }, { id: "owner", role: "CUSTOMER" }])("allows owner or moderator to inspect pending images", async (user) => {
    mocks.find.mockResolvedValue({ status: "PENDING", userId: null, orderItem: { order: { userId: "owner" } } }); mocks.auth.mockResolvedValue({ user });
    expect((await get()).status).toBe(200);
  });
  it("does not serve a removed attachment even if its file still exists", async () => {
    mocks.find.mockResolvedValue(null); expect((await get()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects path traversal before querying or reading", async () => {
    expect((await get("../../.env")).status).toBe(404); expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
});
