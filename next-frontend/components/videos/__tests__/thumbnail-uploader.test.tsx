// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FakeXHR } from "@/lib/videos/__tests__/fake-xhr"
import { buildVideo, VIDEO_FIXTURE_ID } from "@/mocks/factories/videos"
import { server } from "@/mocks/server"
import { ThumbnailUploader } from "../thumbnail-uploader"

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

beforeEach(() => {
  refreshMock.mockClear()
  FakeXHR.reset()
  vi.stubGlobal("XMLHttpRequest", FakeXHR)
})
afterEach(() => vi.unstubAllGlobals())

describe("<ThumbnailUploader />", () => {
  it("plans, PUTs the image to the storage and confirms", async () => {
    const user = userEvent.setup({ applyAccept: false })
    const calls: string[] = []
    server.use(
      http.post(`/api/videos/${VIDEO_FIXTURE_ID}/thumbnail`, async ({ request }) => {
        calls.push(`plan ${JSON.stringify(await request.json())}`)
        return HttpResponse.json({ url: "http://localhost:9000/put/thumb-custom" })
      }),
      http.post(`/api/videos/${VIDEO_FIXTURE_ID}/thumbnail/confirm`, () => {
        calls.push("confirm")
        return HttpResponse.json(buildVideo({ hasCustomThumbnail: true }))
      })
    )
    render(<ThumbnailUploader video={buildVideo()} />)
    const file = new File([new Uint8Array(512)], "thumb.png", { type: "image/png" })
    await user.upload(screen.getByLabelText(/Enviar thumbnail/), file)

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(calls).toEqual(['plan {"contentType":"image/png"}', "confirm"])
    expect(FakeXHR.instances[0].url).toBe("http://localhost:9000/put/thumb-custom")
    expect(FakeXHR.instances[0].headers["content-type"]).toBe("image/png")
  })

  it("rejects unsupported types and oversized files client-side", async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<ThumbnailUploader video={buildVideo()} />)
    await user.upload(
      screen.getByLabelText(/Enviar thumbnail/),
      new File([new Uint8Array(10)], "a.gif", { type: "image/gif" })
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(/JPEG, PNG ou WebP/)
    expect(FakeXHR.instances).toHaveLength(0)
  })

  it("removes the custom thumbnail through DELETE", async () => {
    const user = userEvent.setup()
    server.use(
      http.delete(`/api/videos/${VIDEO_FIXTURE_ID}/thumbnail`, () =>
        HttpResponse.json(buildVideo({ hasCustomThumbnail: false }))
      )
    )
    render(<ThumbnailUploader video={buildVideo({ hasCustomThumbnail: true })} />)
    expect(screen.getByText("Usando a sua imagem.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Voltar para a thumbnail gerada/ }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
  })
})
