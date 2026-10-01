import { email as copy } from "@/lib/copy/email";
import { emailLayout, emailStyles } from "./layout";

/** Phase 0 proof template (kept as the pipeline smoke test). */
export function renderProofEmail(): string {
  return emailLayout(`
    <h1 style="${emailStyles.h1}">${copy.proof.heading}</h1>
    <p style="${emailStyles.p}">${copy.proof.body}</p>
    <p style="${emailStyles.small}">${copy.proof.footer}</p>
  `);
}
