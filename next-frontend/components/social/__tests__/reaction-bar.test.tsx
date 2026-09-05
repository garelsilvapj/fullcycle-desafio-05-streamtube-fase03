// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SessionProvider } from "@/components/auth/session-provider"
import { server } from "@/mocks/server"
import { ReactionBar } from "../reaction-bar"

const logged = { userId: "u1", email: "a@example.com", channelSlug: "a", isLoggedIn: true }
const anon = { userId: "", email: "", channelSlug: "", isLoggedIn: false }
const initial = { likes: 5, dislikes: 1, myReaction: null }

describe("<ReactionBar />", () => {
  it("anonymous sees counts, disabled buttons and a login CTA", () => {
    render(
      <SessionProvider initialSession={anon}>
        <ReactionBar endpoint="/api/videos/v-1/reaction" initial={initial} />
      </SessionProvider>
    )
    expect(screen.getByRole("button", { name: /5/ })).toBeDisabled()
    expect(screen.getByRole("link", { name: "Entre para reagir" })).toHaveAttribute("href", "/login")
  })

  it("optimistically applies a like, then adopts the BFF summary; clicking again removes it", async () => {
    const user = userEvent.setup()
    const methods: string[] = []
    server.use(
      http.put("/api/videos/v-1/reaction", async ({ request }) => {
        methods.push(`PUT ${JSON.stringify(await request.json())}`)
        return HttpResponse.json({ likes: 6, dislikes: 1, myReaction: "like" })
      }),
      http.delete("/api/videos/v-1/reaction", () => {
        methods.push("DELETE")
        return HttpResponse.json({ likes: 5, dislikes: 1, myReaction: null })
      })
    )
    render(
      <SessionProvider initialSession={logged}>
        <ReactionBar endpoint="/api/videos/v-1/reaction" initial={initial} />
      </SessionProvider>
    )
    const like = screen.getByRole("button", { name: /👍/ })
    await user.click(like)
    await waitFor(() => expect(like).toHaveAttribute("aria-pressed", "true"))
    expect(like).toHaveTextContent("6")
    await user.click(like)
    await waitFor(() => expect(like).toHaveAttribute("aria-pressed", "false"))
    expect(methods).toEqual(['PUT {"type":"like"}', "DELETE"])
  })

  it("rolls back and shows the error when the BFF fails", async () => {
    const user = userEvent.setup()
    server.use(
      http.put("/api/videos/v-1/reaction", () =>
        HttpResponse.json({ statusCode: 404, error: "VIDEO_NOT_FOUND", message: "Sumiu", code: null }, { status: 404 })
      )
    )
    render(
      <SessionProvider initialSession={logged}>
        <ReactionBar endpoint="/api/videos/v-1/reaction" initial={initial} />
      </SessionProvider>
    )
    await user.click(screen.getByRole("button", { name: /👎/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Sumiu")
    expect(screen.getByRole("button", { name: /👎/ })).toHaveTextContent("1")
  })
})
