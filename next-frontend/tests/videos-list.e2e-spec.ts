import { expect, test } from "./fixtures"
import { loginViaUi } from "./_helpers"

test.describe("videos-list", () => {
  // 1. Listar os vídeos do canal com status e navegar para o detalhe

  test("1.1 lista-meus-videos-com-status", async ({ page }) => {
    await loginViaUi(page)
    await page.goto("/videos")

    await expect(page.getByRole("heading", { name: "Meus vídeos" })).toBeVisible()
    const cards = page.locator("[data-slot='video-card']")
    await expect(cards).toHaveCount(3)
    await expect(cards.nth(0)).toHaveAttribute("data-status", "ready")
    await expect(cards.nth(1)).toHaveAttribute("data-status", "processing")
    await expect(cards.nth(2)).toHaveAttribute("data-status", "failed")
    await expect(page.getByText("Processando")).toBeVisible()
    await expect(page.getByText("Falhou")).toBeVisible()

    await cards.nth(0).getByRole("link").click()
    await expect(page).toHaveURL(/\/videos\/11111111-1111-4111-8111-111111111111$/)
  })

  test("1.2 header-mostra-sessao-e-logout", async ({ page }) => {
    await loginViaUi(page, "alice@example.com")
    await page.goto("/videos")

    await expect(page.locator("[data-slot='session-email']")).toHaveText("alice@example.com")
    await page.locator("[data-slot='logout-button']").click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto("/videos")
    await expect(page).toHaveURL(/\/login$/)
  })
})
