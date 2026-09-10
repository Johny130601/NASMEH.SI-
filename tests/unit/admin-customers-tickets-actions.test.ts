import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(), userUpdateMany: vi.fn(), userFindUnique: vi.fn(), ticketUpdateMany: vi.fn(), anonymise: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/db", () => ({ db: { user: { updateMany: mocks.userUpdateMany, findUnique: mocks.userFindUnique }, ticket: { updateMany: mocks.ticketUpdateMany } } }));
vi.mock("@/lib/admin/customers", () => ({ anonymiseCustomer: mocks.anonymise }));

import { anonymiseCustomerAction, saveCustomerNotesAction } from "@/app/admin/(shell)/stranke/[id]/actions";
import { updateTicketAction } from "@/app/admin/(shell)/podpora/[id]/actions";

const session = (role: string) => ({ user: { id: `cmf0${role.toLowerCase()}00000000000000001`, email: `${role.toLowerCase()}@nasmeh.si`, name: role, role, mfaEnrolled: true } });
const userId = "cmf0customer000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(session("SUPPORT"));
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.ticketUpdateMany.mockResolvedValue({ count: 1 });
  mocks.userFindUnique.mockResolvedValue({ id: "cmf0staff0000000000000001", role: "SUPPORT" });
  mocks.anonymise.mockResolvedValue({ ok: true, orders: 1, tickets: 0 });
});

describe("customer actions", () => {
  it.each(["MANAGER", "FULFILLMENT"])("%s can neither annotate nor anonymise customers", async (role) => {
    mocks.auth.mockResolvedValue(session(role));
    await expect(saveCustomerNotesAction({ userId, tags: "vip", adminNotes: "" })).rejects.toThrow("forbidden");
    await expect(anonymiseCustomerAction({ userId })).rejects.toThrow("forbidden");
    expect(mocks.anonymise).not.toHaveBeenCalled();
  });

  it("SUPPORT saves normalised tags and notes on customer accounts only", async () => {
    expect(await saveCustomerNotesAction({ userId, tags: " VIP, vip ,, ambasador ", adminNotes: "  Klicala 10. 9.  " })).toEqual({ ok: true });
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({ where: { id: userId, role: "CUSTOMER" }, data: { tags: ["vip", "ambasador"], adminNotes: "Klicala 10. 9." } });
    mocks.userUpdateMany.mockResolvedValue({ count: 0 });
    expect(await saveCustomerNotesAction({ userId, tags: "", adminNotes: "" })).toEqual({ ok: false, error: "not_found" });
  });

  it("anonymises exactly one target with the actor recorded, lower-casing guest e-mails", async () => {
    expect(await anonymiseCustomerAction({ userId })).toEqual({ ok: true });
    expect(mocks.anonymise).toHaveBeenCalledWith({ userId }, "support@nasmeh.si");
    expect(await anonymiseCustomerAction({ email: "Gost@Test.SI" })).toEqual({ ok: true });
    expect(mocks.anonymise).toHaveBeenLastCalledWith({ email: "gost@test.si" }, "support@nasmeh.si");
    expect(await anonymiseCustomerAction({})).toEqual({ ok: false, error: "invalid" });
    expect(await anonymiseCustomerAction({ userId, email: "x@test.si" })).toEqual({ ok: false, error: "invalid" });
    mocks.anonymise.mockResolvedValue({ ok: false, reason: "staff" });
    expect(await anonymiseCustomerAction({ userId })).toEqual({ ok: false, error: "staff" });
  });
});

describe("ticket actions", () => {
  it.each(["MANAGER", "FULFILLMENT"])("%s cannot handle tickets", async (role) => {
    mocks.auth.mockResolvedValue(session(role));
    await expect(updateTicketAction({ ticketId: "cmf0ticket000000000000001", status: "CLOSED", assigneeId: "", internalNote: "" })).rejects.toThrow("forbidden");
    expect(mocks.ticketUpdateMany).not.toHaveBeenCalled();
  });

  it("SUPPORT updates status, a staff assignee and the internal note", async () => {
    expect(await updateTicketAction({ ticketId: "cmf0ticket000000000000001", status: "IN_PROGRESS", assigneeId: "cmf0staff0000000000000001", internalNote: " poklicati " })).toEqual({ ok: true });
    expect(mocks.ticketUpdateMany).toHaveBeenCalledWith({
      where: { id: "cmf0ticket000000000000001" },
      data: { status: "IN_PROGRESS", assigneeId: "cmf0staff0000000000000001", internalNote: "poklicati" },
    });
    expect(await updateTicketAction({ ticketId: "cmf0ticket000000000000001", status: "CLOSED", assigneeId: "", internalNote: "" })).toEqual({ ok: true });
    expect(mocks.ticketUpdateMany.mock.calls[1][0].data).toEqual({ status: "CLOSED", assigneeId: null, internalNote: null });
  });

  it("refuses unknown statuses and non-staff assignees", async () => {
    expect(await updateTicketAction({ ticketId: "t", status: "DONE", assigneeId: "", internalNote: "" })).toEqual({ ok: false, error: "invalid" });
    mocks.userFindUnique.mockResolvedValue({ id: "cmf0cust", role: "CUSTOMER" });
    expect(await updateTicketAction({ ticketId: "t", status: "OPEN", assigneeId: "cmf0cust", internalNote: "" })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.ticketUpdateMany).not.toHaveBeenCalled();
  });
});
