import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 9 step 4 review X7: a guest's erasure must not reload the guest page into a 404. */

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

const mocks = vi.hoisted(() => ({ listCustomers: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/admin/access", () => ({ requirePagePermission: vi.fn(async () => ({ role: "SUPPORT" })) }));
vi.mock("@/lib/admin/customers", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/admin/customers")>()), listCustomers: mocks.listCustomers }));
vi.mock("@/app/admin/(shell)/stranke/[id]/actions", () => ({ anonymiseCustomerAction: vi.fn(), saveCustomerNotesAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import AdminCustomersPage from "@/app/admin/(shell)/stranke/page";
import { anonymiseDestination } from "@/components/admin/CustomerActions";
import { admin as copy } from "@/lib/copy";

const renderList = async (query: Record<string, string>) =>
  renderToStaticMarkup(await AdminCustomersPage({ searchParams: Promise.resolve(query) }));

beforeEach(() => {
  mocks.listCustomers.mockResolvedValue({ rows: [], total: 0, page: 1, pages: 1, truncated: false });
});

describe("after anonymisation", () => {
  it("sends a guest to the customer list, and keeps an account or a failed attempt on its page", () => {
    expect(anonymiseDestination({ email: "gost@test.si" }, { ok: true })).toBe("/admin/stranke?anonimizirano=1");
    expect(anonymiseDestination({ userId: "u1" }, { ok: true })).toBeNull();
    expect(anonymiseDestination({ email: "gost@test.si" }, { ok: false })).toBeNull();
  });

  it("shows the success notice on the list the guest is sent to, and only there", async () => {
    const destination = new URL(anonymiseDestination({ email: "gost@test.si" }, { ok: true })!, "https://nasmeh.example");
    expect(destination.pathname).toBe("/admin/stranke");
    const html = await renderList(Object.fromEntries(destination.searchParams));
    expect(html).toContain("data-customer-anonymised-notice");
    expect(html).toContain(copy.customers.anonymisedNotice);

    const others: Array<Record<string, string>> = [{}, { anonimizirano: "da" }, { q: "ana" }];
    for (const query of others) {
      expect(await renderList(query)).not.toContain("data-customer-anonymised-notice");
    }
  });
});
