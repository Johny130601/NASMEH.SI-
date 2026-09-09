/**
 * Shared email HTML shell (table-based, inline styles — email-client safe).
 * NOTE: Next.js forbids react-dom/server in the app build graph, so Phase 1
 * templates are string templates; a full React-email pipeline can replace
 * them later without changing call sites.
 */
export function emailLayout(content: string): string {
  return `<!doctype html>
<html lang="sl">
  <body style="margin:0;padding:2rem;background-color:rgb(250,250,252);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:rgb(28,28,30);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td style="background-color:rgb(255,255,255);border-radius:0.5rem;padding:2rem;">
            ${content}
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}

export const emailStyles = {
  h1: "font-size:1.5rem;font-weight:300;",
  p: "font-size:1rem;line-height:1.5;",
  small: "font-size:0.75rem;line-height:1.5;color:rgb(99,99,102);",
  button:
    "display:inline-block;background-color:rgb(28,28,30);color:rgb(255,255,255);text-decoration:none;padding:0.9rem 2rem;border-radius:3rem;font-size:1rem;font-weight:500;",
  link: "color:rgb(0,122,255);word-break:break-all;",
} as const;
