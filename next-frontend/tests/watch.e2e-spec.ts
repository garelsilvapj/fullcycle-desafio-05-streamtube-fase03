import { expect, test } from "./fixtures"

const READY_SLUG = "aB3dE5fG7hI"
const READY_ID = "11111111-1111-4111-8111-111111111111"

test.describe("watch", () => {
  // 1. Assistir um vídeo publicado sem login: player, informações, descrição, sugestões, download

  test("1.1 pagina-publica-anonima-com-player-e-sugestoes", async ({ page }) => {
    const rangeResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/videos/${READY_ID}/stream`) && r.status() === 206
    )
    await page.goto(`/watch/${READY_SLUG}`)

    await expect(page.locator("[data-slot='watch-page']")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Vídeo de exemplo" })).toBeVisible()
    await expect(page.locator("[data-slot='video-player']")).toHaveAttribute("src", `/api/videos/${READY_ID}/stream`)
    await expect(page.locator("[data-slot='watch-meta']")).toContainText(/12 visualizações/)
    await expect(page.locator("[data-slot='watch-channel']")).toHaveAttribute("href", "/c/alice")
    await expect(page.locator("[data-slot='download-link']")).toHaveAttribute("href", `/api/videos/${READY_ID}/download`)
    await expect(page.locator("[data-slot='related-video']")).toHaveCount(1)
    await expect(page.locator("[data-slot='related-video'] a")).toHaveAttribute("href", "/watch/rElAtEd0001")

    // O navegador pede o vídeo com Range e o BFF público responde 206.
    expect((await rangeResponse).headers()["content-range"]).toMatch(/^bytes \d+-\d+\/4096$/)
  })

  test("1.2 play-registra-visualizacao-uma-vez", async ({ page }) => {
    await page.goto(`/watch/${READY_SLUG}`)
    const posts: string[] = []
    page.on("request", (r) => {
      if (r.url().includes(`/api/videos/${READY_ID}/views`) && r.method() === "POST") posts.push(r.url())
    })
    const viewPost = page.waitForRequest(
      (r) => r.url().includes(`/api/videos/${READY_ID}/views`) && r.method() === "POST"
    )
    await page.evaluate(() => {
      const v = document.querySelector("video")
      v?.dispatchEvent(new Event("play"))
      v?.dispatchEvent(new Event("play"))
    })
    await viewPost
    await page.waitForTimeout(500)
    expect(posts).toHaveLength(1)
  })

  test("1.3 unlisted-abre-pelo-link-e-rascunho-404", async ({ page }) => {
    await page.goto("/watch/unListEd001")
    await expect(page.locator("[data-slot='watch-meta']")).toContainText("não listado")
    const res = await page.goto("/watch/draft000000")
    expect(res?.status()).toBe(404)
  })

  test("1.4 pagina-do-canal-linka-para-watch", async ({ page }) => {
    await page.goto("/c/alice")
    await page.locator("[data-slot='public-video-card'] a").first().click()
    await expect(page).toHaveURL(/\/watch\/aB3dE5fG7hI$/)
  })
})
