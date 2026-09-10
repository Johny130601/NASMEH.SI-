import { z } from "zod";
import { kodaCodeSchema } from "@/lib/koda-code";

/** Coupon form schema (§14.4), safe to import from client components. BXGY stays model-only (P2). */

export const COUPON_TYPES = ["PERCENT", "FIXED", "FIXED_PRODUCT", "FREE_SHIPPING"] as const;
export type CouponFormType = (typeof COUPON_TYPES)[number];

const idSchema = z.string().min(1).max(64);
const slugSchema = z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const emailSchema = z.string().trim().toLowerCase().email().max(200);
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Operators enter validity windows in the store's time zone whatever the server's zone is (containers run in UTC). */
export const STORE_TIME_ZONE = "Europe/Ljubljana";

const zoneParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
};

/** Minutes the zone is ahead of UTC at the given instant. */
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = zoneParts(date, timeZone);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()) / 60_000);
}

/** "YYYY-MM-DDTHH:mm" wall-clock time in the zone → instant; null when the fields are not a real date. */
export function zonedDateTimeToDate(value: string, timeZone = STORE_TIME_ZONE): Date | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(guess).getUTCDate() !== day) return null;
  const first = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess - zoneOffsetMinutes(new Date(first), timeZone) * 60_000);
}

/** Instant → "YYYY-MM-DDTHH:mm" wall-clock time in the zone (for datetime-local inputs). */
export function dateToZonedDateTime(date: Date | null, timeZone = STORE_TIME_ZONE): string | null {
  if (!date) return null;
  const p = zoneParts(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** `datetime-local` value in the store's time zone; empty = open-ended. */
const dateTimeInput = z.string().trim().max(32).nullable().transform((value, ctx) => {
  if (!value) return null;
  const date = zonedDateTimeToDate(value);
  if (!date) { ctx.addIssue({ code: "custom", message: "date" }); return z.NEVER; }
  return date;
});

export const couponSchema = z.object({
  code: kodaCodeSchema,
  type: z.enum(COUPON_TYPES),
  percentOff: z.number().int().min(1).max(100).nullable(),
  amountOffCents: z.number().int().min(1).max(10_000_000).nullable(),
  usageLimitTotal: z.number().int().min(1).max(1_000_000).nullable(),
  usageLimitPerCustomer: z.number().int().min(1).max(1_000).nullable(),
  startsAt: dateTimeInput,
  endsAt: dateTimeInput,
  minSpendCents: z.number().int().min(1).max(10_000_000).nullable(),
  eligibleProductIds: z.array(idSchema).max(50),
  eligibleCollectionSlugs: z.array(slugSchema).max(20),
  eligibleEmails: z.array(emailSchema).max(200),
  excludedProductIds: z.array(idSchema).max(50),
  active: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.type === "PERCENT" && value.percentOff === null) ctx.addIssue({ code: "custom", path: ["percentOff"], message: "percent" });
  if ((value.type === "FIXED" || value.type === "FIXED_PRODUCT") && value.amountOffCents === null) ctx.addIssue({ code: "custom", path: ["amountOffCents"], message: "amount" });
  if (value.startsAt && value.endsAt && value.endsAt.getTime() <= value.startsAt.getTime()) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "dates" });
});
export type CouponInput = z.input<typeof couponSchema>;
export type CouponValues = z.output<typeof couponSchema>;
