import { expect, test } from "./fixtures"
import { loginViaUi } from "./_helpers"

test.describe("channel", () => {
  // 1. Editar o canal e ver a página pública

  test("1.1 editar-canal-e-erro-de-nickname-em-uso", async ({ page }) => {
    await loginViaUi(page)
    await page.goto("/studio/channel")

    await expect(page.getByRole("heading", { name: "Meu canal" })).toBeVisible()
    await page.getByLabel(/Nickname/).fill("taken")
    await page.getByRole("button", { name: "Salvar canal" }).click()
    await expect(page.getByText("Este nickname já está em uso")).toBeVisible()

    await page.getByLabel(/Nickname/).fill("alice_studios")
    const patch = page.waitForResponse(
      (r) => r.url().includes("/api/channels/me") && r.request().method() === "PATCH"
    )
    await page.getByRole("button", { name: "Salvar canal" }).click()
    expect((await patch).status()).toBe(200)
    await expect(page.getByRole("status")).toContainText("Canal atualizado.")
  })

  test("1.2 pagina-publica-do-canal-sem-login", async ({ page }) => {
    await page.goto("/c/alice")
    await expect(page.locator("[data-slot='public-channel']")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible()
    await expect(page.getByText("@alice · 1 vídeo")).toBeVisible()
    const cards = page.locator("[data-slot='public-video-card']")
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText("Vídeo de exemplo")
    await expect(cards.first()).toContainText(/visualizações/)
  })

  test("1.3 canal-inexistente-404", async ({ page }) => {
    const res = await page.goto("/c/ghost")
    expect(res?.status()).toBe(404)
  })
})
