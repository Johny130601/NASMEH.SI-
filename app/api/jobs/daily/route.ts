import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { retryPendingOrderConfirmations } from "@/lib/orders/confirmation-delivery";
import { retryPendingShippedEmails } from "@/lib/orders/shipped-delivery";
import { sendDueReviewRequests } from "@/lib/jobs/review-requests";
import { sendPendingRestockAlerts } from "@/lib/jobs/restock-alerts";
import { retryPendingTicketEmails } from "@/lib/support/delivery";

export const dynamic = "force-dynamic";

/** Host-cron endpoint. Responses and failure logs expose counts only. */
export async function POST(request: Request) {
  const secret = getEnv().JOBS_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const confirmationRetries = await retryPendingOrderConfirmations();
    const shippedRetries = await retryPendingShippedEmails();
    const reviews = await sendDueReviewRequests();
    const restockAlerts = await sendPendingRestockAlerts();
    const ticketRetries = await retryPendingTicketEmails();
    return NextResponse.json({ ...reviews, confirmationRetries, shippedRetries, restockAlerts, ticketRetries }, {
      status: reviews.failed || confirmationRetries.failed || shippedRetries.failed || restockAlerts.failed || ticketRetries.failed ? 503 : 200,
    });
  } catch {
    console.error("Daily delivery job requires retry");
    return NextResponse.json({ error: "retry_required" }, { status: 503 });
  }
}
