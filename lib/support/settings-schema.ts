import { z } from "zod";

/** `support.contact` shape (Phase 6): header-free so admin forms can validate it in the browser. */
export const contactSettingsSchema = z.object({
  supportEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  complianceEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  hours: z.string().trim().min(1).max(300),
  responseTime: z.string().trim().min(1).max(300),
}).strict();

export type ContactSettings = z.infer<typeof contactSettingsSchema>;
export type ContactSettingsInput = z.input<typeof contactSettingsSchema>;

/** Placeholder values are seeded data, never an operational launch promise. */
export const DEFAULT_CONTACT_SETTINGS: ContactSettings = {
  supportEmail: "podpora@nasmeh.test",
  complianceEmail: "skladnost@nasmeh.test",
  hours: "Delovni čas bomo objavili ob odprtju trgovine.",
  responseTime: "Na vaše sporočilo bomo odgovorili po e-pošti.",
};
