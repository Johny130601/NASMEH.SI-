import { z } from "zod";
import { getSetting } from "@/lib/settings";

export const contactSettingsSchema = z.object({
  supportEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  complianceEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  hours: z.string().trim().min(1).max(300),
  responseTime: z.string().trim().min(1).max(300),
}).strict();

export type ContactSettings = z.infer<typeof contactSettingsSchema>;

/** Placeholder values are seeded data, never an operational launch promise. */
export const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  supportEmail: "podpora@nasmeh.test",
  complianceEmail: "skladnost@nasmeh.test",
  hours: "Delovni čas bomo objavili ob odprtju trgovine.",
  responseTime: "Na vaše sporočilo bomo odgovorili po e-pošti.",
};

export async function getContactSettings(): Promise<ContactSettings> {
  const value = await getSetting<unknown>("support.contact");
  if (value === null) return DEFAULT_CONTACT_SETTINGS;
  // Invalid operator configuration fails before a ticket/email is created.
  return contactSettingsSchema.parse(value);
}
