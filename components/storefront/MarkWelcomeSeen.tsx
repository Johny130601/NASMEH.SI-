"use client";

import { useEffect } from "react";
import { markWelcomeSeen } from "@/lib/welcome-popup-flag";

/**
 * Sets the welcome popup's session flag once mounted and renders nothing. A
 * success state that proves this visitor just gave their e-mail renders it —
 * the newsletter confirmation (/potrdi) opens in a new tab from the mail, whose
 * sessionStorage starts empty, and its "home" button must not lead to a popup
 * asking for the address just confirmed (QA T7-F14). Same listed key, no new
 * storage (lib/welcome-popup-flag.ts).
 */
export function MarkWelcomeSeen() {
  useEffect(() => {
    markWelcomeSeen();
  }, []);
  return null;
}
