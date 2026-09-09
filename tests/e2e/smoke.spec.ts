import { expect, test } from "@playwright/test";

test("GET / returns 200 with seeded catalog in the SSR HTML", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  // SSR proof (AGENTS §5.1): product copy present in initial HTML, no JS needed
  expect(html).toContain("Belilni trakci");
  expect(html).toContain("Paket popolna rutina");
  expect(html).toContain("34,99");
});

test("GET /api/health returns 200 with db up", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.db).toBe("up");
});
