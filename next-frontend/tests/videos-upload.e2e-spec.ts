import { expect, test } from "./fixtures"
import { fakeStorage, loginViaUi } from "./_helpers"

// 1 spec → 1 file com um describe (feature = stem do arquivo) + N test() blocks.
test.describe("videos-upload", () => {
  // 1. Enviar um vídeo pela interface: registrar → PUT direto no storage → confirmar → processar

  test("1.1 upload-completo-ate-ready", async ({ page }) => {
    await loginViaUi(page)
    await fakeStorage(page)
    await page.goto("/upload")

    await expect(page.getByRole("heading", { name: "Enviar vídeo" })).toBeVisible()
    await page.getByLabel("Título").fill("Meu vídeo E2E")
    await page.getByLabel(/Descrição/).fill("enviado pelo Playwright")
    await page.getByLabel(/Arquivo de vídeo/).setInputFiles({
      name: "sample.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.alloc(4096, 1),
    })

    const register = page.waitForResponse(
      (r) => r.url().includes("/api/videos") && r.request().method() === "POST"
    )
    const storagePut = page.waitForRequest(
      (r) => r.url().startsWith("http://localhost:9000/") && r.method() === "PUT"
    )
    await page.getByRole("button", { name: "Enviar vídeo" }).click()

    expect((await register).status()).toBe(201)
    const put = await storagePut
    expect(put.headers()["content-type"]).toBe("video/mp4")

    const status = page.locator("[data-slot='upload-status']")
    await expect(status).toHaveAttribute("data-phase", "ready", { timeout: 15000 })
    await expect(page.getByText("Vídeo pronto!")).toBeVisible()
    await expect(page.getByRole("link", { name: "Assistir" })).toHaveAttribute(
      "href",
      /\/videos\/11111111-1111-4111-8111-111111111111$/
    )
  })

  test("1.2 upload-validacao-client-side", async ({ page }) => {
    await loginViaUi(page)
    await page.goto("/upload")

    const requests: string[] = []
    page.on("request", (r) => {
      if (r.url().includes("/api/videos")) requests.push(r.method())
    })
    await page.getByRole("button", { name: "Enviar vídeo" }).click()
    await expect(page.getByText("Informe um título")).toBeVisible()
    await expect(page.getByText("Selecione um arquivo de vídeo")).toBeVisible()
    expect(requests).toHaveLength(0)
  })

  test("1.3 upload-erro-do-bff-exibe-alerta", async ({ page }) => {
    await loginViaUi(page)
    await fakeStorage(page)
    await page.goto("/upload")

    // "badrequest" é o título reservado que o upstream fake rejeita com 400.
    await page.getByLabel("Título").fill("badrequest")
    await page.getByLabel(/Arquivo de vídeo/).setInputFiles({
      name: "sample.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.alloc(16, 1),
    })
    await page.getByRole("button", { name: "Enviar vídeo" }).click()

    await expect(page.locator("[data-slot='form-error']")).toContainText(/title should not be empty/)
    await expect(page.locator("[data-slot='upload-status']")).toHaveAttribute("data-phase", "error")
  })

  test("1.4 upload-exige-sessao", async ({ page }) => {
    await page.goto("/upload")
    await expect(page).toHaveURL(/\/login$/)
  })
})
