"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addOrderNoteAction,
  cancelOrderAction,
  markDeliveredAction,
  markProcessingAction,
  refundOrderAction,
  resendConfirmationAction,
  resendShippedAction,
  settleCapturedPaymentAction,
  shipOrderAction,
  type OrderActionResult,
} from "@/app/admin/(shell)/narocila/[number]/actions";
import { parseEuroCents } from "@/lib/admin/order-display";
import { admin as copy } from "@/lib/copy/admin";
import { formatEUR } from "@/lib/pricing";
import { UiButton } from "@/components/storefront/ui/UiButton";
import { UiFormField, UiInput } from "@/components/storefront/ui/UiInput";

export interface RefundableLine {
  orderItemId: string;
  title: string;
  sku: string;
  unitPriceCents: number;
  remaining: number;
}

export interface OrderActionsProps {
  orderId: string;
  status: string;
  refundRequired: boolean;
  hasTracking: boolean;
  carriers: string[];
  lines: RefundableLine[];
  shippingCents: number;
  shippingRefunded: boolean;
  remainingCents: number;
  permissions: { fulfil: boolean; refund: boolean; notes: boolean };
}

const selectClass = "min-h-[3.25rem] w-full rounded-input border border-light-1 bg-white px-4 text-base outline-none focus:border-brand";
const textareaClass = "w-full resize-y rounded-input border border-light-1 bg-white p-4 text-base outline-none focus:border-brand";
const REFUNDABLE: ReadonlySet<string> = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);

export function OrderActions(props: OrderActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(props.lines.map((line) => [line.orderItemId, 0])));
  const [refundShipping, setRefundShipping] = useState(false);
  // Typed in euros ("-5,00"), sent in cents; an ambiguous entry blocks the refund instead of being guessed (QA T5-08).
  const [adjustmentText, setAdjustmentText] = useState("");
  const adjustment = parseEuroCents(adjustmentText);
  // A lone sign is an entry still being typed: it blocks the refund but is not flagged yet.
  const adjustmentStarted = /^\s*[+\-−–]\s*$/.test(adjustmentText);

  const previewCents = useMemo(() =>
    props.lines.reduce((sum, line) => sum + line.unitPriceCents * (quantities[line.orderItemId] ?? 0), 0)
      + (refundShipping ? props.shippingCents : 0) + (adjustment ?? 0),
    [props.lines, props.shippingCents, quantities, refundShipping, adjustment]);

  const run = (task: () => Promise<OrderActionResult>) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        const text = copy.orders.actions.results[result.message as keyof typeof copy.orders.actions.results] ?? copy.common.error;
        setMessage({ ok: result.ok, text: result.ok && result.message === "noteSaved" ? copy.common.done : text });
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, text: copy.common.error });
      }
    });
  };

  const canProcess = props.permissions.fulfil && props.status === "PAID" && !props.refundRequired;
  const canShip = props.permissions.fulfil && (props.status === "PAID" || props.status === "PROCESSING") && !props.refundRequired;
  const canDeliver = props.permissions.fulfil && props.status === "SHIPPED";
  // A captured payment that could not be fulfilled is settled with its own control, never cancelled or partly refunded (QA M3).
  const canSettle = props.permissions.refund && props.refundRequired && props.remainingCents > 0;
  const canCancel = props.permissions.refund && ["PENDING", "PAID", "PROCESSING"].includes(props.status) && !props.refundRequired;
  const canRefund = props.permissions.refund && REFUNDABLE.has(props.status) && props.remainingCents > 0 && !props.refundRequired;
  const canResendConfirmation = props.permissions.notes && REFUNDABLE.has(props.status) && !props.refundRequired;
  const canResendShipped = props.permissions.notes && props.hasTracking && ["SHIPPED", "DELIVERED"].includes(props.status);

  return (
    <section className="rounded-card border border-light-2 bg-white p-5" data-order-actions>
      <h2 className="text-lg">{copy.orders.actions.title}</h2>
      {message ? (
        <p role="status" className={`mt-3 text-sm ${message.ok ? "text-success" : "text-error"}`} data-order-action-message>{message.text}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {canProcess ? <UiButton variant="outline" disabled={pending} onClick={() => run(() => markProcessingAction({ orderId: props.orderId }))} data-action="processing">{copy.orders.actions.processing}</UiButton> : null}
        {canDeliver ? <UiButton variant="outline" disabled={pending} onClick={() => run(() => markDeliveredAction({ orderId: props.orderId }))} data-action="deliver">{copy.orders.actions.deliver}</UiButton> : null}
        {canResendConfirmation ? <UiButton variant="ghost" disabled={pending} onClick={() => run(() => resendConfirmationAction({ orderId: props.orderId }))} data-action="resend-confirmation">{copy.orders.actions.resendConfirmation}</UiButton> : null}
        {canResendShipped ? <UiButton variant="ghost" disabled={pending} onClick={() => run(() => resendShippedAction({ orderId: props.orderId }))} data-action="resend-shipped">{copy.orders.actions.resendShipped}</UiButton> : null}
      </div>

      {canSettle ? (
        <form
          className="mt-6 grid gap-4 border-t border-light-2 pt-5 md:grid-cols-[1fr_auto] md:items-end"
          data-settle-form
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get("settleReason") ?? "");
            if (!window.confirm(copy.orders.actions.confirmSettle.replace("{amount}", formatEUR(props.remainingCents)))) return;
            run(() => settleCapturedPaymentAction({ orderId: props.orderId, reason }));
          }}
        >
          <h3 className="text-base font-medium md:col-span-2">{copy.orders.actions.settle}</h3>
          <p className="text-sm text-mid-1 md:col-span-2">{copy.orders.actions.settleHint.replace("{amount}", formatEUR(props.remainingCents))}</p>
          <UiInput label={copy.orders.actions.reason} name="settleReason" required maxLength={500} />
          <UiButton type="submit" variant="primary" disabled={pending} data-action="settle">{copy.orders.actions.settle}</UiButton>
        </form>
      ) : null}

      {canShip ? (
        <form
          className="mt-6 grid gap-4 border-t border-light-2 pt-5 md:grid-cols-[1fr_1fr_auto] md:items-end"
          data-ship-form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => shipOrderAction({ orderId: props.orderId, carrier: String(data.get("carrier") ?? ""), trackingNumber: String(data.get("trackingNumber") ?? "") }));
          }}
        >
          <p className="text-sm text-mid-1 md:col-span-3">{copy.orders.actions.shipHint}</p>
          <UiFormField label={copy.orders.actions.carrier} htmlFor="ship-carrier">
            <select id="ship-carrier" name="carrier" required defaultValue="" className={selectClass}>
              <option value="" disabled>{copy.orders.actions.chooseCarrier}</option>
              {props.carriers.map((carrier) => <option key={carrier} value={carrier}>{carrier}</option>)}
            </select>
          </UiFormField>
          <UiInput label={copy.orders.actions.trackingNumber} name="trackingNumber" required minLength={6} maxLength={60} />
          <UiButton type="submit" variant="primary" disabled={pending} data-action="ship">{copy.orders.actions.ship}</UiButton>
        </form>
      ) : null}

      {canRefund ? (
        <form
          className="mt-6 border-t border-light-2 pt-5"
          data-refund-form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            if (!window.confirm(copy.orders.actions.confirmRefund.replace("{amount}", formatEUR(previewCents)))) return;
            run(() => refundOrderAction({
              orderId: props.orderId,
              lines: props.lines.map((line) => ({ orderItemId: line.orderItemId, quantity: quantities[line.orderItemId] ?? 0 })),
              refundShipping,
              adjustmentCents: adjustment ?? 0,
              reason: String(data.get("reason") ?? ""),
              restock: data.get("restock") === "on",
            }));
          }}
        >
          <h3 className="text-base font-medium">{copy.orders.actions.refundTitle}</h3>
          <p className="mt-1 text-sm text-mid-1">{copy.orders.actions.refundHint}</p>
          <ul className="mt-4 flex flex-col gap-3">
            {props.lines.map((line) => (
              <li key={line.orderItemId} className="grid gap-2 md:grid-cols-[1fr_8rem] md:items-center">
                <span className="text-sm">{line.title} <span className="text-mid-2">({line.sku}) · {formatEUR(line.unitPriceCents)}</span></span>
                <label className="flex items-center gap-2 text-sm">
                  <span className="sr-only">{copy.orders.actions.refundQuantity}</span>
                  <input
                    type="number" min={0} max={line.remaining} value={quantities[line.orderItemId] ?? 0}
                    aria-label={`${copy.orders.actions.refundQuantity} ${line.sku}`} data-refund-qty={line.sku}
                    disabled={line.remaining === 0}
                    onChange={(event) => setQuantities((current) => ({ ...current, [line.orderItemId]: Math.max(0, Math.min(line.remaining, Number(event.target.value) || 0)) }))}
                    className="w-24 rounded-input border border-light-1 px-3 py-2 text-base"
                  />
                  <span className="text-xs text-mid-2">/ {line.remaining}</span>
                </label>
              </li>
            ))}
          </ul>
          {props.shippingCents > 0 && !props.shippingRefunded ? (
            <label className="mt-4 flex items-center gap-3 text-sm">
              <input type="checkbox" checked={refundShipping} onChange={(event) => setRefundShipping(event.target.checked)} className="size-4 accent-brand" data-refund-shipping />
              {copy.orders.actions.refundShipping.replace("{amount}", formatEUR(props.shippingCents))}
            </label>
          ) : null}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <UiInput
              label={copy.orders.actions.adjustment} name="adjustment" inputMode="decimal" autoComplete="off" maxLength={12}
              value={adjustmentText} onChange={(event) => setAdjustmentText(event.target.value)}
              error={adjustment === null && !adjustmentStarted ? copy.orders.actions.adjustmentInvalid : undefined} data-refund-adjustment
            />
            <UiInput label={copy.orders.actions.reason} name="reason" required maxLength={500} />
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm">
            <input type="checkbox" name="restock" defaultChecked className="size-4 accent-brand" data-refund-restock />
            {copy.orders.actions.restock}
          </label>
          <p className="mt-4 text-sm font-medium" data-refund-preview>{copy.orders.actions.refundPreview.replace("{amount}", formatEUR(previewCents))}</p>
          <div className="mt-3">
            <UiButton type="submit" variant="primary" disabled={pending || adjustment === null || previewCents <= 0 || previewCents > props.remainingCents} data-action="refund">{copy.orders.actions.refundSubmit}</UiButton>
          </div>
        </form>
      ) : null}

      {canCancel ? (
        <form
          className="mt-6 grid gap-4 border-t border-light-2 pt-5 md:grid-cols-[1fr_auto] md:items-end"
          data-cancel-form
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get("cancelReason") ?? "");
            if (!window.confirm(copy.orders.actions.confirmCancel)) return;
            run(() => cancelOrderAction({ orderId: props.orderId, reason }));
          }}
        >
          <p className="text-sm text-mid-1 md:col-span-2">{copy.orders.actions.cancelHint}</p>
          <UiInput label={copy.orders.actions.cancelReason} name="cancelReason" required maxLength={500} />
          <UiButton type="submit" variant="outline" disabled={pending} className="border-error text-error" data-action="cancel">{copy.orders.actions.cancel}</UiButton>
        </form>
      ) : null}

      {props.permissions.notes ? (
        <form
          className="mt-6 border-t border-light-2 pt-5"
          data-note-form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            run(async () => {
              const result = await addOrderNoteAction({ orderId: props.orderId, body: String(data.get("body") ?? ""), visibleToCustomer: data.get("visible") === "on" });
              if (result.ok) form.reset();
              return result;
            });
          }}
        >
          <h3 className="text-base font-medium">{copy.orders.notes.add}</h3>
          <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium">
            {copy.orders.notes.body}
            <textarea name="body" required rows={3} maxLength={4000} className={textareaClass} />
          </label>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <input type="checkbox" name="visible" className="size-4 accent-brand" data-note-visible />
            {copy.orders.notes.visible}
          </label>
          <div className="mt-3">
            <UiButton type="submit" variant="outline" disabled={pending} data-action="note">{copy.orders.notes.submit}</UiButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}
