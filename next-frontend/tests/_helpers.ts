import type { Page } from "@playwright/test"

/** Faz login pela UI (o upstream é o MSW server-side, qualquer e-mail não reservado autentica). */
export async function loginViaUi(page: Page, email = "user@example.com") {
  await page.goto("/login")
  await page.getByLabel("Email address").fill(email)
  await page.getByLabel("Password", { exact: true }).fill("secret123")
  const loginResponse = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Sign in" }).click()
  await loginResponse
}

/**
 * O PUT do arquivo vai direto ao storage (URL pré-assinada em localhost:9000), fora do BFF.
 * O MSW server-side não intercepta o navegador, então o storage é substituído aqui — a regra
 * "nunca page.route em /api/**" continua valendo (o BFF real roda).
 */
export async function fakeStorage(page: Page) {
  await page.route("http://localhost:9000/**", (route) =>
    route.fulfill({ status: 200, headers: { ETag: '"e2e-etag"' }, body: "" })
  )
}
