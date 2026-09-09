import type { Order } from "@prisma/client";
import { siteUrl } from "@/lib/seo";
import { email as copy } from "@/lib/copy";
import { emailLayout, emailStyles } from "./layout";

export interface ReviewRequestItem {
  title: string;
  ratingUrls: Array<{ rating: number; token: string }>;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Post-delivery review request (§10): one-click star links per item. */
export function renderReviewRequestEmail(
  order: Order,
  items: ReviewRequestItem[],
): string {
  const base = siteUrl();
  const itemRows = items
    .map((item) => {
      const stars = item.ratingUrls
        .map(
          ({ rating, token }) =>
            `<a href="${base}/oceni/hitro/${encodeURIComponent(token)}" title="${rating}★" style="font-size:1.4rem;text-decoration:none;color:rgb(0,168,143);">★</a>`,
        )
        .join(" ");
      return `<tr>
        <td style="padding:0.6rem 0;font-size:0.95rem;">${escapeHtml(item.title)}</td>
        <td style="padding:0.6rem 0;text-align:right;white-space:nowrap;">${stars}</td>
      </tr>`;
    })
    .join("");

  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.reviewRequest.heading}</h1>
    <p style="${emailStyles.p}">${copy.reviewRequest.body}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:1rem 0;border-top:1px solid rgb(229,229,234);">
      ${itemRows}
    </table>
    <p style="${emailStyles.small}">${copy.reviewRequest.photosNote}</p>
    <p style="${emailStyles.small}">${copy.reviewRequest.footer}</p>
  `);
}
