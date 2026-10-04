import { describe, expect, it } from "vitest";
import { renderOrderStatusEmail } from "@/lib/email/templates/order-status";
import { email as copy } from "@/lib/copy/email";
import { formatEUR } from "@/lib/pricing";

/** Money and copy carry non-breaking spaces; compare on one kind of space. */
const flat = (value: string) => value.replace(/\s+/g, " ");
const accountUrl = "https://nasmeh.si/sledi?sledenje=GLS123";

describe("order status mails (QA 2026-10-03)", () => {
  it("a paid order cancelled by staff names the refund that went with it (T4-05)", () => {
    const html = flat(renderOrderStatusEmail("cancelled", { number: "NS-2026-00007" }, { amountCents: 4999, accountUrl }));
    expect(html).toContain(flat(copy.orderStatus.cancelledRefunded.body));
    expect(html).toContain(`${copy.orderStatus.refundedAmountLabel}: <strong>${flat(formatEUR(4999))}</strong>`);
    expect(html).not.toContain(flat(copy.orderStatus.cancelled.body));
  });

  it("an unpaid cancellation keeps the general wording and states no amount", () => {
    const html = flat(renderOrderStatusEmail("cancelled", { number: "NS-2026-00008" }, { accountUrl }));
    expect(html).toContain(flat(copy.orderStatus.cancelled.body));
    expect(html).not.toContain(copy.orderStatus.refundedAmountLabel);
  });

  it("no mail tells the customer not to reply to the address they are told to write to (T2-12)", () => {
    for (const kind of ["processing", "delivered", "cancelled", "refunded"] as const) {
      expect(renderOrderStatusEmail(kind, { number: "NS-2026-00009" }, { accountUrl })).not.toMatch(/odgovarjajte/);
    }
  });
});
