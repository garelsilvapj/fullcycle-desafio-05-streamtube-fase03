// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildVideo, buildVideoList } from "@/mocks/factories/videos"
import { VideoList } from "../video-list"

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

beforeEach(() => {
  refreshMock.mockClear()
  vi.useRealTimers()
})

describe("<VideoList />", () => {
  it("renders the empty state with a CTA to upload", () => {
    render(<VideoList videos={[]} />)
    expect(screen.getByText(/ainda não enviou/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /primeiro vídeo/ })).toHaveAttribute("href", "/upload")
  })

  it("renders one card per video with title, badge, link and thumbnail via the BFF", () => {
    const videos = buildVideoList()
    const { container } = render(<VideoList videos={videos} />)
    const cards = screen.getAllByRole("listitem")
    expect(cards).toHaveLength(3)
    expect(screen.getByRole("link", { name: /Vídeo de exemplo/ })).toHaveAttribute(
      "href",
      `/videos/${videos[0].id}`
    )
    const thumbnails = container.querySelectorAll("img")
    expect(thumbnails).toHaveLength(1)
    expect(thumbnails[0]).toHaveAttribute("src", `/api/videos/${videos[0].id}/thumbnail`)
    expect(screen.getByText("Processando")).toBeInTheDocument()
    expect(screen.getByText("Falhou")).toBeInTheDocument()
    expect(screen.getAllByText("sem thumbnail")).toHaveLength(2)
  })

  it("auto-refreshes while a video is still processing and stops when none is", () => {
    vi.useFakeTimers()
    const { unmount } = render(
      <VideoList videos={[buildVideo({ status: "processing" })]} refreshIntervalMs={100} />
    )
    vi.advanceTimersByTime(350)
    expect(refreshMock).toHaveBeenCalledTimes(3)
    unmount()

    refreshMock.mockClear()
    render(<VideoList videos={[buildVideo({ status: "ready" })]} refreshIntervalMs={100} />)
    vi.advanceTimersByTime(350)
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
