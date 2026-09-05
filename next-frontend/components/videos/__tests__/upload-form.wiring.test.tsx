// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FakeXHR } from "@/lib/videos/__tests__/fake-xhr"
import { buildRegisterVideoResponse, buildVideo, VIDEO_FIXTURE_ID } from "@/mocks/factories/videos"
import { server } from "@/mocks/server"
import { UploadForm } from "../upload-form"

beforeEach(() => {
  FakeXHR.reset()
  vi.stubGlobal("XMLHttpRequest", FakeXHR)
})
afterEach(() => vi.unstubAllGlobals())

const file = new File([new Uint8Array(2048)], "sample.mp4", { type: "video/mp4" })

function happyPath() {
  const received: Record<string, unknown>[] = []
  server.use(
    http.post("/api/videos", async ({ request }) => {
      received.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(buildRegisterVideoResponse(), { status: 201 })
    }),
    http.post(`/api/videos/${VIDEO_FIXTURE_ID}/confirm`, () =>
      HttpResponse.json(buildVideo({ status: "uploaded", thumbnailUrl: null }))
    ),
    http.get(`/api/videos/${VIDEO_FIXTURE_ID}`, () => HttpResponse.json(buildVideo({ status: "ready" })))
  )
  return received
}

describe("<UploadForm /> wiring", () => {
  it("blocks submit with client-side validation and fires no request", async () => {
    const user = userEvent.setup()
    const onCall = vi.fn()
    server.use(
      http.post("/api/videos", () => {
        onCall()
        return HttpResponse.json({}, { status: 500 })
      })
    )
    render(<UploadForm />)
    await user.click(screen.getByRole("button", { name: "Enviar vídeo" }))

    expect(await screen.findByText("Informe um título")).toBeInTheDocument()
    expect(screen.getByText("Selecione um arquivo de vídeo")).toBeInTheDocument()
    expect(onCall).not.toHaveBeenCalled()
  })

  it("runs the full flow: register → PUT → confirm → ready, with progress and a watch link", async () => {
    const user = userEvent.setup({ applyAccept: false })
    const received = happyPath()
    render(<UploadForm />)

    await user.type(screen.getByLabelText("Título"), "Meu vídeo")
    await user.type(screen.getByLabelText(/Descrição/), "desc")
    await user.upload(screen.getByLabelText(/Arquivo de vídeo/), file)
    await user.click(screen.getByRole("button", { name: "Enviar vídeo" }))

    expect(await screen.findByText("Vídeo pronto!")).toBeInTheDocument()
    expect(received[0]).toEqual({ title: "Meu vídeo", description: "desc", sizeBytes: 2048 })
    expect(FakeXHR.instances).toHaveLength(1)
    expect(FakeXHR.instances[0].body?.size).toBe(2048)
    expect(screen.getByRole("link", { name: "Assistir" })).toHaveAttribute(
      "href",
      `/videos/${VIDEO_FIXTURE_ID}`
    )
    expect(screen.getByText("Pronto")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Enviar outro vídeo" })).toBeInTheDocument()
  })

  it("shows the BFF error as an alert when registration fails", async () => {
    const user = userEvent.setup({ applyAccept: false })
    server.use(
      http.post("/api/videos", () =>
        HttpResponse.json(
          { statusCode: 401, error: "UNAUTHORIZED", message: "Session expired", code: null },
          { status: 401 }
        )
      )
    )
    render(<UploadForm />)
    await user.type(screen.getByLabelText("Título"), "x")
    await user.upload(screen.getByLabelText(/Arquivo de vídeo/), file)
    await user.click(screen.getByRole("button", { name: "Enviar vídeo" }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Session expired")
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Enviar outro vídeo" })).toBeInTheDocument()
    )
  })
})
