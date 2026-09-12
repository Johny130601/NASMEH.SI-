/**
 * Server-rendered JSON-LD (spec §3.3) — escaped for safe inline embedding.
 * A data block is never executed, so the Content-Security-Policy does not
 * apply to it and it carries no nonce (Phase 9 step 1).
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
