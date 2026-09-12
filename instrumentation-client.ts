import { z } from "zod";

/**
 * Runs before any client code on every page (Next.js client instrumentation).
 * Zod 4 compiles object parsers with `new Function` by default; the nonce-based
 * Content-Security-Policy forbids evaluated code, so the browser parses
 * without the JIT (Phase 9 step 1). The server keeps the default.
 */
z.config({ jitless: true });
