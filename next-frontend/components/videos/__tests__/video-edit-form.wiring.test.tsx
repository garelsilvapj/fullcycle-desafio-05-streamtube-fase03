// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildCategories } from "@/mocks/factories/channels"
import { buildVideo, VIDEO_FIXTURE_ID } from "@/mocks/factories/videos"
import { server } from "@/mocks/server"
import { VideoEditForm } from "../video-edit-form"

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }))

beforeEach(() => refreshMock.mockClear())

describe("<VideoEditForm /> wiring", () => {
  it("submits a typed PATCH with null for cleared description/category and refreshes", async () => {
    const user = userEvent.setup()
    const received: Record<string, unknown>[] = []
    server.use(
      http.patch(`/api/videos/${VIDEO_FIXTURE_ID}`, async ({ request }) => {
        received.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(buildVideo({ title: "Novo título" }))
      })
    )
    render(<VideoEditForm video={buildVideo()} categories={buildCategories()} />)

    const title = screen.getByLabelText("Título")
    await user.clear(title)
    await user.type(title, "Novo título")
    await user.clear(screen.getByLabelText("Descrição"))
    await user.selectOptions(screen.getByLabelText("Categoria"), "")
    await user.click(screen.getByLabelText(/Não listado/))
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(received[0]).toEqual({
      title: "Novo título",
      description: null,
      categoryId: null,
      visibility: "unlisted",
    })
    expect(screen.getByRole("status")).toHaveTextContent("Alterações salvas.")
  })

  it("keeps the submit disabled until something changes and blocks invalid titles", async () => {
    const user = userEvent.setup()
    const onCall = vi.fn()
    server.use(
      http.patch(`/api/videos/${VIDEO_FIXTURE_ID}`, () => {
        onCall()
        return HttpResponse.json(buildVideo())
      })
    )
    render(<VideoEditForm video={buildVideo()} categories={buildCategories()} />)
    const submit = screen.getByRole("button", { name: "Salvar alterações" })
    expect(submit).toBeDisabled()

    await user.clear(screen.getByLabelText("Título"))
    await user.click(submit)
    expect(await screen.findByText("Informe um título")).toBeInTheDocument()
    expect(onCall).not.toHaveBeenCalled()
  })

  it("shows the BFF error as a form-level alert", async () => {
    const user = userEvent.setup()
    server.use(
      http.patch(`/api/videos/${VIDEO_FIXTURE_ID}`, () =>
        HttpResponse.json(
          { statusCode: 404, error: "CATEGORY_NOT_FOUND", message: "Categoria não encontrada", code: null },
          { status: 404 }
        )
      )
    )
    render(<VideoEditForm video={buildVideo()} categories={buildCategories()} />)
    await user.selectOptions(screen.getByLabelText("Categoria"), buildCategories()[1].id)
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Categoria não encontrada")
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
