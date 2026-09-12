// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildVideo, VIDEO_FIXTURE_ID } from "@/mocks/factories/videos"
import { server } from "@/mocks/server"
import { PublishToggle } from "../publish-toggle"

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }))

beforeEach(() => refreshMock.mockClear())

describe("<PublishToggle />", () => {
  it("publishes a ready draft and refreshes", async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    server.use(
      http.post(`/api/videos/${VIDEO_FIXTURE_ID}/publish`, () => {
        calls.push("publish")
        return HttpResponse.json(buildVideo({ isPublished: true }))
      })
    )
    render(<PublishToggle video={buildVideo({ isPublished: false, publishedAt: null })} />)
    expect(screen.getByText(/Rascunho/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Publicar" }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(calls).toEqual(["publish"])
  })

  it("disables publishing while the video is not ready", () => {
    render(
      <PublishToggle video={buildVideo({ status: "processing", isPublished: false, publishedAt: null })} />
    )
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled()
    expect(screen.getByText(/Aguarde o processamento/)).toBeInTheDocument()
  })

  it("unpublishes a published video and surfaces BFF errors", async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`/api/videos/${VIDEO_FIXTURE_ID}/unpublish`, () =>
        HttpResponse.json(
          { statusCode: 403, error: "VIDEO_CHANNEL_FORBIDDEN", message: "Não é seu", code: null },
          { status: 403 }
        )
      )
    )
    render(<PublishToggle video={buildVideo()} />)
    expect(screen.getByText(/Publicado em/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Despublicar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Não é seu")
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
