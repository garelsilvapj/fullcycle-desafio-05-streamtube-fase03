import { expect, test } from "./fixtures"

test.describe("home", () => {
  // 1. Home com grid, filtro por categoria, "carregar mais", busca e responsividade

  test("1.1 grid-inicial-e-carregar-mais", async ({ page }) => {
    await page.goto("/")
    const cards = page.locator("[data-slot='video-card-public']")
    await expect(cards).toHaveCount(12)
    await expect(cards.first()).toContainText("Alice")
    await expect(cards.first()).toContainText(/visualizações/)
    await page.locator("[data-slot='load-more']").click()
    await expect(cards).toHaveCount(16)
    await expect(page.locator("[data-slot='load-more']")).toHaveCount(0)
  })

  test("1.2 filtro-por-categoria-na-url", async ({ page }) => {
    await page.goto("/")
    await page.locator("[data-slot='category-chips']").getByRole("link", { name: "Games" }).click()
    await expect(page).toHaveURL(/\?category=games$/)
    await expect(page.locator("[data-slot='video-card-public']").first()).toBeVisible()
    await page.goto("/?category=vazia")
    await expect(page.locator("[data-slot='feed-empty']")).toBeVisible()
  })

  test("1.3 busca-pelo-header-e-resultados", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("searchbox", { name: "Buscar" }).fill("exemplo")
    await page.getByRole("searchbox", { name: "Buscar" }).press("Enter")
    await expect(page).toHaveURL(/\/search\?q=exemplo$/)
    await expect(page.getByRole("heading", { name: /Resultados para/ })).toBeVisible()
    await expect(page.locator("[data-slot='search-grid'] [data-slot='video-card-public']")).toHaveCount(1)
    await page.goto("/search?q=zzzz")
    await expect(page.locator("[data-slot='search-empty']")).toBeVisible()
    await page.goto("/search?q=z")
    await expect(page.locator("[data-slot='search-hint']")).toBeVisible()
  })

  test("1.4 layout-mobile-sem-scroll-horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    await expect(page.locator("[data-slot='app-header']")).toBeVisible()
    await expect(page.getByRole("searchbox", { name: "Buscar" })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.goto("/watch/aB3dE5fG7hI")
    const overflowWatch = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflowWatch).toBeLessThanOrEqual(0)
  })
})
