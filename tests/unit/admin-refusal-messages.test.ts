import * as React from "react";
import { describe, expect, it, vi } from "vitest";

/** QA T5-10, T5-11 (= T7-F22), T6-11: a refusal the operator can act on says why, at the control that caused it. */

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/admin/(shell)/stranke/[id]/actions", () => ({ anonymiseCustomerAction: vi.fn(), saveCustomerNotesAction: vi.fn() }));
vi.mock("@/app/admin/(shell)/ekipa/actions", () => ({
  changeStaffRoleAction: vi.fn(), createStaffMemberAction: vi.fn(), resetStaffTotpAction: vi.fn(), revokeStaffSessionsAction: vi.fn(),
}));
vi.mock("@/app/admin/(shell)/kuponi/actions", () => ({ createCouponAction: vi.fn(), deleteCouponAction: vi.fn(), saveCouponAction: vi.fn() }));
vi.mock("@/app/admin/(shell)/izdelki/actions", () => ({ saveProductAction: vi.fn() }));

import { anonymiseMessage } from "@/components/admin/CustomerActions";
import { teamMessage } from "@/components/admin/TeamManager";
import { errorText } from "@/components/admin/CouponEditor";
import { productSaveError } from "@/components/admin/ProductEditor";
import { admin as copy } from "@/lib/copy";

describe("refusal messages", () => {
  it("explains an erasure refused for a staff account or a vanished person", () => {
    expect(anonymiseMessage({ ok: false, error: "staff" })).toBe(copy.customers.detail.anonymiseRefused.staff);
    expect(anonymiseMessage({ ok: false, error: "not_found" })).toBe(copy.customers.detail.anonymiseRefused.not_found);
    expect(anonymiseMessage({ ok: false, error: "open_order" })).toBe(copy.customers.detail.anonymiseRefused.open_order);
    expect(anonymiseMessage({ ok: false, error: "invalid" })).toBe(copy.common.error);
    expect(anonymiseMessage({ ok: true })).toBe(copy.common.done);
  });

  it("tells a team manager they entered their own e-mail, or that the member is gone", () => {
    expect(teamMessage({ ok: false, error: "self" }, "create")).toBe(copy.team.selfEmail);
    expect(teamMessage({ ok: false, error: "self" }, "member")).toBe(copy.team.selfNote);
    expect(teamMessage({ ok: false, error: "invalid" }, "create")).toBe(copy.team.invalidEmail);
    expect(teamMessage({ ok: false, error: "not_found" }, "member")).toBe(copy.team.notFound);
    expect(teamMessage({ ok: true }, "member")).toBe(copy.common.done);
  });

  it("names the coupon code and the product field that failed", () => {
    expect(errorText({ ok: false, error: "codeInvalid" }, " qa6 bad! ")).toBe(copy.coupons.editor.codeInvalid.replace("{code}", "QA6 BAD!"));
    expect(errorText({ ok: false, error: "invalid" }, "Q6")).toBe(copy.coupons.editor.invalid);
    expect(productSaveError({ ok: false, error: "invalid", field: "slug" })).toBe("Preverite polje »Slug (URL)«.");
    expect(productSaveError({ ok: false, error: "invalid", field: "uspChips" })).toBe("Preverite polje »USP oznake«.");
    expect(productSaveError({ ok: false, error: "invalid" })).toBe(copy.catalog.editor.invalid);
    expect(productSaveError({ ok: false, error: "slugTaken" })).toBe(copy.catalog.editor.slugTaken);
  });
});
