import * as React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vitest compiles .tsx with the classic JSX runtime (tsconfig "jsx": "preserve"), which expects a global React.
(globalThis as { React?: typeof React }).React = React;

const mocks = vi.hoisted(() => ({ connection: vi.fn(), requirePagePermission: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/admin/access", () => ({ requirePagePermission: mocks.requirePagePermission }));

import { AdminTableScroll } from "@/components/admin/AdminTableScroll";
import AdminShellNotFound from "@/app/admin/(shell)/not-found";
import CustomerNotFound from "@/app/admin/(shell)/stranke/not-found";
import OrderNotFound from "@/app/admin/(shell)/narocila/not-found";
import AdminUnknownPage from "@/app/admin/(shell)/[...missing]/page";
import { admin as copy } from "@/lib/copy/admin";
import { notFound as storefrontNotFound } from "@/lib/copy/notFound";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.requirePagePermission.mockResolvedValue({ role: "FULFILLMENT" });
});

/** QA 2026-10-03 T4-09: an admin 404 rendered the storefront page, whose countdown sent staff to the shop home. */
describe("the admin's own 404", () => {
  it("leads back to the section's list and the dashboard, with no redirect countdown", async () => {
    const customers = renderToStaticMarkup(await CustomerNotFound());
    expect(customers).toContain("data-admin-not-found");
    expect(customers).toContain(copy.notFound.customers);
    expect(customers).toMatch(/<a [^>]*data-admin-not-found-back="true" href="\/admin\/stranke"/);
    expect(customers).toContain('href="/admin"');
    for (const html of [customers, renderToStaticMarkup(await OrderNotFound()), renderToStaticMarkup(await AdminShellNotFound())]) {
      expect(html).not.toContain("data-countdown");
      expect(html).not.toContain(storefrontNotFound.countdownPrefix);
      expect(html).toContain(copy.notFound.title);
    }
    expect(renderToStaticMarkup(await OrderNotFound())).toMatch(/<a [^>]*data-admin-not-found-back="true" href="\/admin\/narocila"/);
    expect(renderToStaticMarkup(await AdminShellNotFound())).not.toContain("data-admin-not-found-back");
    // Rendered per request, so its scripts carry the request's nonce (AGENTS §8.18).
    expect(mocks.connection).toHaveBeenCalledTimes(5);
  });

  it("answers an /admin address no route matches inside the shell, for every staff role", async () => {
    await expect(AdminUnknownPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.requirePagePermission).toHaveBeenCalledWith("dashboard:view");
  });
});

/** QA 2026-10-03 T4-10: at 768 px whole columns sat off screen with no sign that the table scrolls. */
describe("the wide-table scroll cue", () => {
  it("is a named, focusable scroller whose edge shadows come from the colour tokens", () => {
    const html = renderToStaticMarkup(React.createElement(AdminTableScroll, { label: "Naročila", className: "mt-4" } as React.ComponentProps<typeof AdminTableScroll>, React.createElement("table")));
    expect(html).toMatch(/^<div role="region" aria-label="Naročila" tabindex="0" class="overflow-x-auto rounded-card border border-light-2 mt-4"/);
    // Covers travel with the table (local), shadows stay at the card's edges (scroll): CSS only, nothing animates.
    expect(html).toContain("background-attachment:local, local, scroll, scroll");
    expect(html).toContain("rgba(var(--dark-1), 0.16)");
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(html).not.toMatch(/transition|animation/);
  });

  it("wraps the orders, customers and tickets tables", () => {
    const root = join(__dirname, "..", "..");
    for (const page of ["narocila", "stranke", "podpora"]) {
      const source = readFileSync(join(root, "app", "admin", "(shell)", page, "page.tsx"), "utf8");
      expect(source, page).toContain("<AdminTableScroll");
      expect(source, page).not.toContain("overflow-x-auto");
    }
  });
});
