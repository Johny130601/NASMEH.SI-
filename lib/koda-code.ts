import { z } from "zod";

/** Coupon code format shared by /koda/{CODE}, the cart field and the admin form; no server imports. */
export const kodaCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,23}$/);
