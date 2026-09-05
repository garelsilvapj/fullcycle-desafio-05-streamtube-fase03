// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { buildVideo } from "@/mocks/factories/videos"
import { server } from "@/mocks/server"
import { FeedGrid } from "../feed-grid"

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const page1 = { items: [buildVideo({ id: "a", slug: "aaaaaaaaaaa", title: "Primeiro" })], page: 1, limit: 1, total: 2 }

describe("<FeedGrid />", () => {
  it("renders the first page and loads the next one through the BFF", async () => {
    const user = userEvent.setup()
    server.use(
      http.get("/api/videos/feed", ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("page")).toBe("2")
        expect(url.searchParams.get("category")).toBe("games")
        return HttpResponse.json({
          items: [buildVideo({ id: "b", slug: "bbbbbbbbbbb", title: "Segundo" })],
          page: 2,
          limit: 1,
          total: 2,
        })
      })
    )
    render(<FeedGrid initial={page1} category="games" />)
    expect(screen.getByText("Primeiro")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Carregar mais" }))
    expect(await screen.findByText("Segundo")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("button", { name: /Carregar/ })).not.toBeInTheDocument())
    expect(screen.getAllByRole("article")).toHaveLength(2)
  })

  it("shows the empty state and an error when loading fails", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<FeedGrid initial={{ items: [], page: 1, limit: 12, total: 0 }} />)
    expect(screen.getByText(/Nenhum vídeo publicado/)).toBeInTheDocument()
    unmount()

    server.use(http.get("/api/videos/feed", () => HttpResponse.json({}, { status: 500 })))
    render(<FeedGrid initial={page1} />)
    await user.click(screen.getByRole("button", { name: "Carregar mais" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível/)
  })
})
