import { z } from "zod";

export const reviewSettingsSchema = z.object({
  autoPublishMinStars: z.union([z.literal(0), z.literal(4), z.literal(5)]),
  requestDelayDays: z.number().int().min(7).max(10),
});
export type ReviewSettings = z.infer<typeof reviewSettingsSchema>;
