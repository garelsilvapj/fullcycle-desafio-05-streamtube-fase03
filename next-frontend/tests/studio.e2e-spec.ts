import { expect, test } from "./fixtures"
import { fakeStorage, loginViaUi } from "./_helpers"

const READY_ID = "11111111-1111-4111-8111-111111111111"

test.describe("studio", () => {
  // 1. Painel do canal: listar, filtrar, editar, publicar e trocar thumbnail

  test("1.1 painel-lista-videos-com-status-e-publicacao", async ({ page }) => {
    await loginViaUi(page)
    await page.goto("/studio")

    await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible()
    const rows = page.locator("[data-slot='studio-row']")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).locator("[data-slot='published-badge']")).toContainText(/Publicado/)
    await expect(rows.nth(1)).toContainText("Rascunho")
    await expect(page.getByText("Página 1 de 1 · 3 vídeos")).toBeVisible()

    await page.getByRole("link", { name: "Rascunhos" }).click()
    await expect(page).toHaveURL(/published=false/)
    await expect(page.locator("[data-slot='studio-row']")).toHaveCount(2)

    await page.getByRole("link", { name: "Com falha" }).click()
    await expect(page.locator("[data-slot='studio-row']")).toHaveCount(1)
  })

  test("1.2 editar-metadados-e-publicar", async ({ page }) => {
    await loginViaUi(page)
    await page.goto(`/studio/videos/${READY_ID}`)

    await expect(page.getByRole("heading", { name: "Editar vídeo" })).toBeVisible()
    await page.getByLabel("Título").fill("Título editado no E2E")
    await page.getByLabel("Categoria").selectOption({ label: "Música" })
    await page.getByLabel(/Não listado/).check()

    const patch = page.waitForResponse(
      (r) => r.url().includes(`/api/videos/${READY_ID}`) && r.request().method() === "PATCH"
    )
    await page.getByRole("button", { name: "Salvar alterações" }).click()
    expect((await patch).status()).toBe(200)
    await expect(page.getByRole("status")).toContainText("Alterações salvas.")

    // Publicação: o fixture ready já está publicado → despublicar.
    const toggle = page.locator("[data-slot='publish-toggle']")
    await expect(toggle).toHaveAttribute("data-published", "true")
    const unpublish = page.waitForResponse((r) => r.url().endsWith("/unpublish"))
    await page.getByRole("button", { name: "Despublicar" }).click()
    expect((await unpublish).status()).toBe(200)
  })

  test("1.3 thumbnail-propria-put-direto-no-storage", async ({ page }) => {
    await loginViaUi(page)
    await fakeStorage(page)
    await page.goto(`/studio/videos/${READY_ID}`)

    const plan = page.waitForResponse(
      (r) => r.url().endsWith(`/api/videos/${READY_ID}/thumbnail`) && r.request().method() === "POST"
    )
    const put = page.waitForRequest((r) => r.method() === "PUT" && r.url().startsWith("http://localhost:9000/"))
    const confirm = page.waitForResponse((r) => r.url().endsWith("/thumbnail/confirm"))
    await page.getByLabel(/Enviar thumbnail/).setInputFiles({
      name: "thumb.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(2048, 3),
    })
    expect((await plan).status()).toBe(200)
    expect((await put).headers()["content-type"]).toBe("image/png")
    expect((await confirm).status()).toBe(200)
  })

  test("1.4 studio-exige-sessao", async ({ page }) => {
    await page.goto("/studio")
    await expect(page).toHaveURL(/\/login$/)
  })
})
