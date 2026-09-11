import { getSetting } from "@/lib/settings";
import { contactSettingsSchema, DEFAULT_CONTACT_SETTINGS, type ContactSettings } from "./settings-schema";

export { contactSettingsSchema, DEFAULT_CONTACT_SETTINGS, type ContactSettings };

export async function getContactSettings(): Promise<ContactSettings> {
  const value = await getSetting<unknown>("support.contact");
  if (value === null) return DEFAULT_CONTACT_SETTINGS;
  // Invalid operator configuration fails before a ticket/email is created.
  return contactSettingsSchema.parse(value);
}
