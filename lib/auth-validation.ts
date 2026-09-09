import { z } from "zod";

export const authEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
// bcrypt accepts at most 72 UTF-8 bytes; reject rather than silently truncate.
export const newPasswordSchema = z.string().min(8).max(72)
  .refine(value => Buffer.byteLength(value, "utf8") <= 72);
export const authTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const humanTokenSchema = z.string().max(2048).default("");
export const authActivationSchema = z.object({
  passwordHash: z.string().regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/),
  name: z.string().max(121).nullable(),
  marketingOptIn: z.boolean(),
}).strict();
