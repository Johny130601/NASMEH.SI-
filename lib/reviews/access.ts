import { verifyRatingToken } from "./rating-token";

/** Review authorship belongs to the purchaser; an admin role adds no authority. */
export function canReviewItem(input: {
  orderItemId: string;
  orderUserId: string | null;
  sessionUserId?: string;
  token?: string;
  secret: string;
  now?: number;
}): boolean {
  if (input.sessionUserId && input.orderUserId === input.sessionUserId) return true;
  return verifyRatingToken(input.token, input.secret, input.now)?.orderItemId === input.orderItemId;
}
