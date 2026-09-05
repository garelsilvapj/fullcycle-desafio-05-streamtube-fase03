import { expect, test } from "./fixtures"
import { loginViaUi } from "./_helpers"

const READY_ID = "11111111-1111-4111-8111-111111111111"
const PROCESSING_ID = "22222222-2222-4222-8222-222222222222"
const FAILED_ID = "33333333-3333-4333-8333-333333333333"

test.describe("videos-player", () => {
  // 1. Assistir um vídeo pronto via streaming pelo BFF (Range → 206), baixar e ver metadados

  test("1.1 player-usa-stream-do-bff-com-range", async ({ page }) => {
    await loginViaUi(page)
    const rangeResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/videos/${READY_ID}/stream`) && r.status() === 206
    )
    await page.goto(`/videos/${READY_ID}`)

    const player = page.locator("[data-slot='video-player']")
    await expect(player).toBeVisible()
    await expect(player).toHaveAttribute("src", `/api/videos/${READY_ID}/stream`)
    await expect(page.getByRole("heading", { name: "Vídeo de exemplo" })).toBeVisible()
    await expect(page.getByText("0:08")).toBeVisible()
    await expect(page.locator("[data-slot='download-link']")).toHaveAttribute(
      "href",
      `/api/videos/${READY_ID}/download`
    )

    // O navegador pede o vídeo com Range e o BFF responde 206 (proxy preserva os headers).
    const res = await rangeResponse
    expect(res.headers()["content-range"]).toMatch(/^bytes \d+-\d+\/4096$/)
    expect(res.headers()["accept-ranges"]).toBe("bytes")
  })

  test("1.2 video-em-processamento-mostra-status", async ({ page }) => {
    await loginViaUi(page)
    await page.goto(`/videos/${PROCESSING_ID}`)
    await expect(page.locator("[data-slot='video-pending']")).toBeVisible()
    await expect(page.getByText(/ainda está sendo processado/)).toBeVisible()
    await expect(page.locator("[data-slot='video-player']")).toHaveCount(0)
    await expect(page.locator("[data-slot='delete-video']")).toHaveCount(0)
  })

  test("1.3 video-com-falha-mostra-erro-do-worker", async ({ page }) => {
    await loginViaUi(page)
    await page.goto(`/videos/${FAILED_ID}`)
    await expect(page.locator("[data-slot='video-pending'] [role='alert']")).toContainText(/ffprobe falhou/)
    await expect(page.locator("[data-slot='delete-video']")).toBeVisible()
  })

  test("1.4 video-inexistente-404", async ({ page }) => {
    await loginViaUi(page)
    const res = await page.goto("/videos/00000000-0000-4000-8000-000000000404")
    expect(res?.status()).toBe(404)
  })
})
