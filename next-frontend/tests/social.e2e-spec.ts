import { expect, test } from "./fixtures"
import { loginViaUi } from "./_helpers"

const READY_SLUG = "aB3dE5fG7hI"

test.describe("social", () => {
  // 1. Reagir, comentar, responder e inscrever-se a partir da página de visualização

  test("1.1 anonimo-ve-contagens-e-ctas-de-login", async ({ page }) => {
    await page.goto(`/watch/${READY_SLUG}`)
    await expect(page.locator("[data-slot='reaction-bar']").first()).toContainText("12")
    await expect(page.locator("[data-slot='reaction-login-cta']")).toBeVisible()
    await expect(page.locator("[data-slot='subscribers-count']")).toHaveText("42 inscritos")
    await expect(page.locator("[data-slot='comments-login-cta']")).toBeVisible()
    await expect(page.locator("[data-slot='comment']")).toHaveCount(2)
  })

  test("1.2 logado-curte-comenta-responde-e-se-inscreve", async ({ page }) => {
    await loginViaUi(page)
    await page.goto(`/watch/${READY_SLUG}`)

    const likeReq = page.waitForResponse((r) => r.url().endsWith("/reaction") && r.request().method() === "PUT")
    await page.locator("[data-slot='like-button']").first().click()
    expect((await likeReq).status()).toBe(200)
    await expect(page.locator("[data-slot='like-button']").first()).toHaveAttribute("aria-pressed", "true")

    const subReq = page.waitForResponse((r) => r.url().includes("/subscription") && r.request().method() === "PUT")
    await page.getByRole("button", { name: "Inscrever-se" }).click()
    expect((await subReq).status()).toBe(200)
    await expect(page.locator("[data-slot='subscribers-count']")).toHaveText("43 inscritos")

    await page.getByLabel("Adicione um comentário").fill("Comentário do E2E")
    const post = page.waitForResponse((r) => r.url().endsWith("/comments") && r.request().method() === "POST")
    await page.getByRole("button", { name: "Comentar" }).click()
    expect((await post).status()).toBe(201)

    await page.getByRole("button", { name: "Responder" }).first().click()
    await page.getByLabel("Escreva uma resposta").fill("Resposta do E2E")
    const reply = page.waitForResponse((r) => r.url().endsWith("/replies") && r.request().method() === "POST")
    await page.locator("[data-slot='comment-form']").last().getByRole("button", { name: "Responder" }).click()
    expect((await reply).status()).toBe(201)
  })

  test("1.3 pagina-de-inscricoes-lista-canais-seguidos", async ({ page }) => {
    await loginViaUi(page)
    await page.goto("/subscriptions")
    await expect(page.getByRole("heading", { name: "Inscrições" })).toBeVisible()
    const channels = page.locator("[data-slot='followed-channel']")
    await expect(channels).toHaveCount(1)
    await expect(channels.first()).toContainText("Alice")
    await expect(channels.first().getByRole("link", { name: /Vídeo de exemplo/ })).toHaveAttribute("href", `/watch/${READY_SLUG}`)
  })

  test("1.4 studio-mostra-likes-e-comentarios-reais", async ({ page }) => {
    await loginViaUi(page)
    await page.goto("/studio")
    const first = page.locator("[data-slot='studio-row']").first()
    await expect(first.locator("[data-slot='likes-count']")).toHaveText("12")
    await expect(first.locator("[data-slot='comments-count']")).toHaveText("2")
  })
})
