# Phase 3 — Real-provider sandbox acceptance

**Status: not executed. Prepared 2026-09-09.** Every case below still needs recorded evidence from the actual Stripe or PayPal sandbox and the production-style application. This document does not claim that credentials were configured, payments/refunds were made, endpoints were registered, or jobs were run.

The local test driver and mocked unit tests exercise application behavior, signature handling, inventory, retries, and authorization. They cannot certify provider onboarding, actual API payloads, payment authentication, wallet availability, callback browser behavior, or real webhook delivery. Keep their results separate from this checklist. See [the independent audit](phase-3-audit-2026-09-09.md) and [Phase 3 plan](../plans/phase-3.md) for the local history.

## 1. Establish the sandbox environment

- [ ] Record the commit/image being tested, HTTPS staging origin, database name, tester, date, provider sandbox accounts, webhook endpoint IDs, and configured provider API versions.
- [ ] Use an isolated database and test recipients. Apply migrations and seed the required products/settings there. The normal e2e command seeds its configured database; it is not the command for this manual provider acceptance run.
- [ ] Run the production build with `NODE_ENV=production`. Leave `NASMEH_E2E` and `TURNSTILE_TEST_TOKEN` unset. Confirm that the test-payment buttons are absent. In particular, PayPal's real approval/capture path must not be tested with the e2e flag enabled.
- [ ] Use one stable, publicly reachable HTTPS origin through the intended reverse proxy. Browse and return to that same hostname throughout checkout; do not mix localhost, an IP address, `www`, and the staging hostname.
- [ ] Verify the browser loads the correct sandbox publishable/client IDs after deployment. Rebuild/redeploy when changing public configuration and verify the delivered page, rather than assuming the new environment reached the browser.

Configure these names from [`.env.example`](../../.env.example); record only whether each is configured, never its value in evidence:

| Area | Variables | Acceptance configuration |
| --- | --- | --- |
| Application | `DATABASE_URL`, `PORT`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_SITE_URL` | Isolated DB; stable signing secret; `AUTH_URL` and site URL use the HTTPS staging origin. |
| Stripe | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Matching sandbox API keys; signing secret for this exact webhook destination. |
| Klarna | `STRIPE_KLARNA_ENABLED` | Start with `false`; follow the eligibility gate below before enabling it. |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENVIRONMENT` | Same sandbox REST app, its actual registered webhook ID, and `PAYPAL_ENVIRONMENT=sandbox`. The browser receives this app's client ID from the server. |
| Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Real widget keys allowing the staging hostname. |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Controlled test mailbox or isolated Mailpit sink; no unrelated recipients. |
| Scheduled delivery | `JOBS_SECRET` | Dedicated secret available in the app container and the host job's invocation context. |

`PAYPAL_WEBHOOK_SECRET` belongs to the synthetic HMAC test harness; it is **not** the real PayPal verification credential. Real verification uses `PAYPAL_WEBHOOK_ID` and PayPal's verification API. The sandbox must use a sandbox buyer distinct from the seller account. [PayPal sandbox guide](https://developer.paypal.com/sandbox-testing/overview), [webhook integration](https://developer.paypal.com/api/rest/webhooks/rest/).

## 2. Register and verify the actual webhook destinations

Register full event payloads for the following app routes. Keep the provider account/app and environment consistent with the checkout credentials.

| Destination | Required event names | Expected application behavior |
| --- | --- | --- |
| `/api/webhooks/stripe` | `payment_intent.succeeded` | Captured amount/currency must match the stored order; one payment transition and one inventory deduction. |
| Same Stripe destination | `payment_intent.payment_failed` | An unpaid order remains `PENDING`, with failure recorded and retry available. |
| Same Stripe destination | `payment_intent.canceled` | Only an unpaid pending order becomes `CANCELLED`; no stock changes. |
| Same Stripe destination | `charge.refunded` | Cumulative partial refund updates `refundedCents`; full refund becomes `REFUNDED`. |
| `/api/webhooks/paypal` | `CHECKOUT.ORDER.APPROVED` | May request idempotent server capture; approval itself never marks the local order paid. |
| Same PayPal destination | `PAYMENT.CAPTURE.COMPLETED` | Only verified completed capture with matching amount/currency can pay the order. |
| Same PayPal destination | `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.DENIED` | Record failure without stock deduction or a paid transition. |
| Same PayPal destination | `PAYMENT.CAPTURE.REFUNDED` | Resolve the original order, including through the capture reference where needed; apply each refund once. |

PayPal's current reference names `DECLINED` in the Payments v2 table and `DENIED` in the v1 table. The application accepts both. Register the event types exposed by the actual sandbox app and retain evidence of the exact delivered names. [PayPal event reference](https://developer.paypal.com/api/rest/webhooks/event-names/).

- [ ] Complete a checkout-created sandbox payment and inspect the provider's actual event delivery, signature verification result, response status, and matching local `ProcessedEvent` row. A generic provider simulator event that references no local order does not prove order completion.
- [ ] Send an unsigned/tampered request to each staging webhook and confirm HTTP 400 with no order, stock, or processed-event mutation.
- [ ] Test real PayPal transmission headers and registered webhook ID. An unavailable verification API should produce a retryable failure, not a successful payment.
- [ ] Confirm proxy middleware does not redirect webhook POSTs, require a browser session, or alter request bytes.

For optional local Stripe diagnosis, the CLI listener can forward selected events:

```sh
stripe listen \
  --events payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,charge.refunded \
  --forward-to http://127.0.0.1:3000/api/webhooks/stripe
```

Use the listener's signing secret only with that listener. Final staging acceptance also needs the registered HTTPS destination. To test a real event's replay, use Dashboard resend or `stripe events resend EVENT_ID --webhook-endpoint=ENDPOINT_ID` with recorded sandbox IDs. Provider deliveries can arrive out of order. [Stripe webhook setup and delivery behavior](https://docs.stripe.com/webhooks).

## 3. Card, authentication, and PayPal checkout matrix

For every payment case, start through the storefront: product → cart → checkout → review → provider form. Record the displayed EUR total, shipping, discount, and included VAT before submission. Use a fresh controlled email/order where a new order is intended.

Stripe test inputs: `4242 4242 4242 4242` for ordinary success; `4000 0027 6000 3184` for a required authentication challenge; `4000 0000 0000 9995` for insufficient funds. Use a future expiry and valid-format CVC. Run authentication through this app's Payment Element, not a dashboard-created payment. [Stripe test cards](https://docs.stripe.com/testing?testing-method=card-numbers&locale=en-GB), [decline test input](https://docs.stripe.com/payments/without-card-authentication).

| ID | Action | Required result | Evidence/status |
| --- | --- | --- | --- |
| S1 | Complete ordinary Stripe card payment. | One local order/intent, one captured total, one stock deduction, paid confirmation and invoice. | Not run |
| S2 | Complete the 3DS challenge. | Authentication completes; payment becomes paid only after verified success delivery. | Not run |
| S3 | Fail or close 3DS, then retry in the same order. | Failure/pending UI, no premature stock/email; successful retry uses the existing intent/order. | Not run |
| S4 | Use the insufficient-funds card, then a successful card. | Clear failure, order remains payable, correct stored amount on retry. | Not run |
| S5 | Cancel an uncaptured intent through the Stripe sandbox tools. | Canceled webhook closes only the unpaid order; UI does not attempt to reuse or recreate that canceled intent. A new checkout is an explicit action. | Not run |
| P1 | Approve PayPal Smart Buttons using the sandbox buyer. | Server capture occurs, real `COMPLETED` webhook pays the order, amount and order IDs reconcile. | Not run |
| P2 | Approve PayPal and close the buyer browser before its callback finishes. | Registered `APPROVED` webhook can complete idempotent capture; `COMPLETED` remains the local payment authority. | Not run |
| P3 | Cancel PayPal approval and return; reload the pending confirmation. | Return keeps purchaser access; pending order exposes a usable resume path, without a new unintended order/capture. | Not run |
| P4 | Retry approved/completed PayPal orders and repeat an approval notification. | Same PayPal order/capture; no second charge. Completed capture waits for its webhook if delivery is delayed. | Not run |
| P5 | Exercise capture refusal and a temporary capture API failure. | No paid state or inventory deduction; failure and retry operate against the original order. Capture-denial event names are recorded. | Not run |

For PayPal negative cases, follow its supported sandbox failure mechanism. The repository does not expose a production fault-injection flag. A temporary sandbox-only diagnostic harness may be needed to attach `PayPal-Mock-Response`; remove it after testing. A mocked API failure does not by itself prove delivery of a real declined-capture webhook. [PayPal negative-testing guidance](https://developer.paypal.com/platforms/checkout/advanced/sdk/v1/).

Repeat S1/P1 for a discounted basket, a paid-shipping basket, the free-shipping boundary, and a bundle containing a SKU also bought separately. Invoice subtotal minus discount plus shipping must equal the captured total. Review the actual PDF for Slovenian characters, seller details, line quantities, discount, VAT, and readable layout.

## 4. Delays, failure recovery, inventory, and refunds

These cases must use a dedicated sandbox order and actual provider IDs. Record application and provider evidence separately when a scenario requires controlled local fault injection.

| ID | Action | Required result | Evidence/status |
| --- | --- | --- | --- |
| R1 | Temporarily prevent delivery of a real success event; finish provider checkout. | Local order remains pending; recovery shows awaiting-webhook state for Stripe `processing`/`succeeded` or PayPal `COMPLETED`. No claim that a browser redirect paid the order. Restore/replay delivery and observe exactly one completion. | Not run |
| R2 | Refresh, double-submit, or retry after a provider creation timeout. | One order number and stable PSP idempotency identity; recovery retrieves/associates the original intent. Payment credentials are not returned before association succeeds. | Not run |
| R3 | Fail a dedicated order's DB transition after stock mutation, for example with a temporary private invoice-number collision. | Webhook returns retryable failure; stock and event marker roll back. Remove the test conflict and resend the same event; it completes once. | Not run |
| R4 | Replay the same completed event; then deliver a distinct success event after `PROCESSING`. | Status/timestamps are preserved; no extra stock deduction or ordinary duplicate email. | Not run |
| R5 | Two approved sandbox orders compete for the final stock unit. | Exactly one fulfillment deduction. The other captured order explicitly records `paidAt`, `refundRequired=true`, and `fulfillmentIssue`; stock never becomes negative. | Not run |
| R6 | Stock disappears between checkout and capture; include overlapping bundle components. | Captured stockout is visibly refund-required, not portrayed as an unpaid cancellation. Complete and reconcile the sandbox refund. | Not run |
| R7 | Refund a portion, then the remaining balance through the provider sandbox. | Partial refund preserves fulfillment state; `refundedCents` is correct; full refund becomes `REFUNDED`. Stock is not automatically restored by this Phase 3 path. | Not run |
| R8 | Replay refund notifications and subsequently replay an earlier payment success. | Refund is not counted twice; the order remains refunded, with no new stock deduction. Verify PayPal refund → capture → order reference resolution. | Not run |
| R9 | Submit payment with a deliberately altered provider-side amount on a dedicated test intent. | Resume refuses mismatched payment credentials. A mismatched captured webhook does not silently fulfill; investigate/reconcile the captured money and retained failed delivery. | Not run |
| R10 | Observe a real asynchronous pending capture/processing case if the provider supports reproducing one. | No premature fulfillment; eventual completion/failure reconciles correctly. If not reproducible, retain this as pending rather than relabel a mocked test as real-provider proof. | Not run |

Refunds in this checklist can be initiated in the provider's sandbox dashboard/API. This does not certify the future administrative refund UI. A `refundRequired` flag records work to perform; it does not issue a refund automatically.

## 5. Callback ownership and cart behavior

- [ ] Before leaving for 3DS/PayPal, verify the app issued the purchaser's `nasmeh_order_<hash>` cookie with `HttpOnly`, `Secure`, `SameSite=Lax`, and path `/`. Do not copy its value into evidence.
- [ ] Complete a same-browser, top-level return to `/potrditev/{orderNumber}` over the same HTTPS hostname. Repeat on supported mobile/browser combinations and after reload.
- [ ] Open that URL in a separate anonymous browser with no purchaser receipt: it must not reveal the order or permit account creation, payment resume, or capture. Repeat while logged in as a different customer. Owner access should continue to work.
- [ ] Confirm the checkout key, order receipt, and payment client secret are absent from application logs and shared screenshots. Provider-inserted return parameters must not bypass the server ownership check.
- [ ] Complete post-purchase account verification and login; the correct order remains linked. An unrelated user cannot claim it by knowing the sequential number.
- [ ] Confirm only the purchased cart is cleared. Add new cart items after payment, revisit the old confirmation, and verify those later items remain. Repeat with a logged-in cart.

These are this repository's access contract, implemented in `lib/orders/access*.ts` and `lib/orders/post-purchase.ts`. A successful provider redirect alone is not ownership proof.

## 6. Real Turnstile and wallet/Klarna eligibility

- [ ] With real staging widget keys, obtain a token and create an order successfully. Omit/tamper with the token and confirm the server rejects submission before order/payment creation.
- [ ] Leave the challenge token unused for more than five minutes, then submit. Confirm a fresh token can be obtained and retry succeeds without duplicating an existing order. Repeat a used token and verify rejection. Cloudflare tokens expire after 300 seconds and are single-use. [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
- [ ] Register the exact wallet-rendering domain/subdomains in the appropriate Stripe environment; test HTTPS and real supported browser/device combinations. Compare the provider's wallet demo when diagnosing a missing wallet. Do not count a rendered payment icon as a wallet acceptance test. [Domain registration](https://docs.stripe.com/payments/payment-methods/pmd-registration?dashboard-or-api=api), [wallet rendering checks](https://docs.stripe.com/testing/wallets).
- [ ] Complete Apple Pay and Google Pay sandbox transactions and reconcile their actual payment-method details, webhook delivery, cancellation, and refunds. Follow the provider's wallet-specific test setup; ordinary Stripe test card numbers cannot simply be added to Apple Wallet. [Apple Pay testing](https://docs.stripe.com/apple-pay?platform=web), [Google Pay testing](https://docs.stripe.com/google-pay?platform=web).
- [ ] Keep `STRIPE_KLARNA_ENABLED=false` until the actual merchant account, **Slovenian buyer location**, EUR transaction range, product category, and offered repayment plan are confirmed eligible. As checked on 2026-09-09, Stripe's business-location matrix includes Slovenia, while the Klarna customer-location list does not. Merchant eligibility does not establish SI shopper eligibility. Record provider confirmation before changing that decision. [Payment-method support](https://docs.stripe.com/payments/payment-methods/payment-method-support), [Klarna customer locations and plans](https://docs.stripe.com/payments/klarna?locale=en-GB).
- [ ] If provider-confirmed eligible, enable Klarna only in staging and test an actual supported Slovenian-buyer scenario through the real provider sandbox: acceptance, abandonment, rejection, asynchronous confirmation, and partial/full refunds at the launch prices. Do not substitute a foreign buyer address to certify the SI launch. Otherwise record a documented ineligible skip. With the flag disabled, verify the PDP, sticky purchase bar, cart, and footer contain no Klarna installment claims or badge.

## 7. Confirmation delivery retries and host job

The existing `POST /api/jobs/daily` route requires `Authorization: Bearer <JOBS_SECRET>`. It retries order confirmations (default maximum 25 pending orders), processes up to 50 eligible review-request orders, and retries up to 50 pending support-ticket mail deliveries. Its JSON response contains `confirmationRetries` and `ticketRetries`, each with `{ processed, sent, failed, skipped }`; top-level counters refer to review requests. HTTP 503 means an actual send failure in any stream; recipients skipped because another worker owns the lease are not counted as failures.

The app does not schedule this endpoint by itself. Register an invocation with the home server's existing scheduler, at least daily, and record its timezone and failure monitoring. From the deployed compose project, the following invokes the route inside the app container without putting the secret value in a shell argument:

```sh
docker compose exec -T app node -e '
const secret = process.env.JOBS_SECRET;
if (!secret) throw new Error("JOBS_SECRET is not configured");
fetch("http://127.0.0.1:3000/api/jobs/daily", {
  method: "POST",
  headers: { authorization: "Bearer " + secret },
  signal: AbortSignal.timeout(120000)
}).then(async response => {
  console.log(await response.text());
  if (!response.ok) process.exitCode = 1;
}).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});'
```

- [ ] Verify missing/wrong job authorization returns 401 and sends no mail.
- [ ] Make SMTP unavailable for one dedicated sandbox purchase. The payment must stay committed and `confirmationEmailPending=true`; restart the app, restore SMTP, and invoke the job. Confirm the PDF email arrives and `confirmationEmailSentAt` is populated.
- [ ] Run the job again: successfully delivered confirmations are not sent again. Check `confirmationEmailLastError` and remaining backlog explicitly; HTTP 200 alone does not prove every pending email was delivered.
- [ ] Exercise recovery after a worker stops while holding a delivery lease. The lease expires after five minutes. Delivery is at-least-once under a crash after SMTP acceptance; the deterministic Message-ID helps identify such retries but is not an exactly-once guarantee.
- [ ] Preserve normal refund-required behavior: captured stockouts must not receive an ordinary fulfillment-confirmed email. Review-request effects of this shared endpoint must also be confined to test recipients during acceptance.

Code references: [job route](../../app/api/jobs/daily/route.ts), [confirmation delivery](../../lib/orders/confirmation-delivery.ts).

## 8. Reconcile and record acceptance

For each completed case retain: case ID, commit/image, sandbox account/environment, order number, provider order/intent/capture/refund IDs, event IDs, delivery responses, browser/device, sanitized screenshots, and result (`pass`, `fail`, `pending`, or an evidenced eligibility skip). Never attach credentials, full cookie values, payment client secrets, or real customer data.

- [ ] Reconcile local `Order.totalCents`/currency against the accepted quote, PSP captured gross amount, invoice, and confirmation email. Reconcile `refundedCents` against provider refund objects. Fees/net settlement are separate from the customer gross total.
- [ ] Reconcile `paidAt`, `stockDeducted`, order timeline/status, component quantities, `ProcessedEvent`, and confirmation-delivery fields. Investigate every provider capture with no matched local paid/refund-required record, and every local paid order without corresponding provider capture.
- [ ] Resolve every refund-required test order in the provider sandbox and verify the refund webhook closes that obligation locally. Preserve evidence before removing test fixtures.
- [ ] Record endpoint registration, secrets configured without disclosure, expected events, retry-job deployment, and wallet/Klarna availability separately from functional test results.

Acceptance of this checklist establishes the tested **sandbox** configuration only. Production credentials, live endpoint registrations, final domain/device eligibility, and the launch operational checkout/refund exercise remain the separate Phase 9 release gate in [the master plan](../GENERAL_PLAN.md).
