// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SessionProvider } from "@/components/auth/session-provider"
import { buildComment, buildCommentTree, ROOT_COMMENT_ID } from "@/mocks/factories/social"
import { VIDEO_FIXTURE_ID } from "@/mocks/factories/videos"
import { server } from "@/mocks/server"
import { CommentsSection } from "../comments-section"

const logged = { userId: "u1", email: "a@example.com", channelSlug: "a", isLoggedIn: true }
const anon = { userId: "", email: "", channelSlug: "", isLoggedIn: false }
const initial = { items: buildCommentTree(), page: 1, limit: 20, total: 1, commentsCount: 2 }

describe("<CommentsSection />", () => {
  it("renders the thread with replies and a login CTA for anonymous users", () => {
    render(
      <SessionProvider initialSession={anon}>
        <CommentsSection videoId={VIDEO_FIXTURE_ID} initial={initial} />
      </SessionProvider>
    )
    expect(screen.getByRole("heading", { name: "2 comentários" })).toBeInTheDocument()
    expect(screen.getByText("Primeiro comentário!")).toBeInTheDocument()
    expect(screen.getByText("Resposta do Bob")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Entre" })).toHaveAttribute("href", "/login")
  })

  it("posts a comment, reloads the list, and replies to a root comment", async () => {
    const user = userEvent.setup()
    const posted: string[] = []
    server.use(
      http.post(`/api/videos/${VIDEO_FIXTURE_ID}/comments`, async ({ request }) => {
        posted.push(((await request.json()) as { body: string }).body)
        return HttpResponse.json(buildComment({ body: "novo", mine: true }), { status: 201 })
      }),
      http.get(`/api/videos/${VIDEO_FIXTURE_ID}/comments`, () =>
        HttpResponse.json({
          items: [{ ...buildComment({ id: "n1", body: "novo", mine: true }), replies: [] }, ...buildCommentTree()],
          page: 1,
          limit: 20,
          total: 2,
          commentsCount: 3,
        })
      ),
      http.post(`/api/comments/${ROOT_COMMENT_ID}/replies`, async ({ request }) => {
        posted.push(`reply:${((await request.json()) as { body: string }).body}`)
        return HttpResponse.json(buildComment({ id: "r9", parentId: ROOT_COMMENT_ID, body: "resp", mine: true }), { status: 201 })
      })
    )
    render(
      <SessionProvider initialSession={logged}>
        <CommentsSection videoId={VIDEO_FIXTURE_ID} initial={initial} />
      </SessionProvider>
    )
    await user.type(screen.getByLabelText("Adicione um comentário"), "novo")
    await user.click(screen.getByRole("button", { name: "Comentar" }))
    expect(await screen.findByRole("heading", { name: "3 comentários" })).toBeInTheDocument()
    expect(screen.getByText("novo")).toBeInTheDocument()

    await user.click(screen.getAllByRole("button", { name: "Responder" })[1])
    const replyBox = screen.getByLabelText("Escreva uma resposta")
    await user.type(replyBox, "resp")
    const form = replyBox.closest("form") as HTMLFormElement
    await user.click(within(form).getByRole("button", { name: "Responder" }))
    await waitFor(() => expect(posted).toEqual(["novo", "reply:resp"]))
  })

  it("shows the BFF error message inline when posting fails", async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`/api/videos/${VIDEO_FIXTURE_ID}/comments`, () =>
        HttpResponse.json({ statusCode: 401, error: "UNAUTHORIZED", message: "Session expired", code: null }, { status: 401 })
      )
    )
    render(
      <SessionProvider initialSession={logged}>
        <CommentsSection videoId={VIDEO_FIXTURE_ID} initial={initial} />
      </SessionProvider>
    )
    await user.type(screen.getByLabelText("Adicione um comentário"), "x")
    await user.click(screen.getByRole("button", { name: "Comentar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Session expired")
  })
})
