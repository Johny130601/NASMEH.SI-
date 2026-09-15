import type { EmailTemplateKey } from "@/lib/email/template-defs";
import { orderConfirmationRequiredHtml, type OrderConfirmationLegal } from "./order-confirmation";
import { renderSubscriptionUnsubscribeBlock } from "./verify-subscription";
import type { RequiredHtml } from "./render";

/**
 * Sample data for the blocks the mailer appends after an override, so the
 * preview and the test send show the whole mail (§14.10). Live sends use the
 * company Setting and the order's own links. No server imports.
 */
const SAMPLE_LEGAL: OrderConfirmationLegal = {
  seller: {
    name: "Nasmeh.si, d.o.o.", address: "Primer ulica 1, 1000 Ljubljana", registrationNumber: "1234567000",
    vatId: "SI12345678", email: "info@nasmeh.si", phone: "+386 1 234 56 78",
  },
  links: {
    terms: "https://nasmeh.si/pogoji-poslovanja", withdrawal: "https://nasmeh.si/odstop-od-pogodbe",
    complaints: "https://nasmeh.si/reklamacije", guarantee: "https://nasmeh.si/garancija-vracila-denarja",
  },
  accepted: { terms: null, withdrawal: null },
};

/** The required block of a key rendered with sample data; "" for keys without one. */
export function sampleRequiredHtml(key: EmailTemplateKey, sample: Record<string, string>): RequiredHtml {
  switch (key) {
    case "orderConfirmation":
      return orderConfirmationRequiredHtml({ estimate: sample.estimate || null, legal: SAMPLE_LEGAL });
    case "verifySubscription":
      return renderSubscriptionUnsubscribeBlock("https://nasmeh.si/odjava-novice/primer");
    default:
      return "";
  }
}
