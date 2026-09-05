// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SessionProvider } from "@/components/auth/session-provider"
import { server } from "@/mocks/server"
import { SubscribeButton } from "../subscribe-button"

const logged = { userId: "u1", email: "a@example.com", channelSlug: "a", isLoggedIn: true }
const anon = { userId: "", email: "", channelSlug: "", isLoggedIn: false }

describe("<SubscribeButton />", () => {
  it("anonymous sees the count and a login CTA", () => {
    render(
      <SessionProvider initialSession={anon}>
        <SubscribeButton channelId="ch-1" initial={{ subscribed: false, subscribersCount: 42 }} />
      </SessionProvider>
    )
    expect(screen.getByText("42 inscritos")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Entre para se inscrever" })).toHaveAttribute("href", "/login")
  })

  it("subscribes and unsubscribes through the BFF, updating the count", async () => {
    const user = userEvent.setup()
    server.use(
      http.put("/api/channels/by-id/ch-1/subscription", () =>
        HttpResponse.json({ subscribed: true, subscribersCount: 43 })
      ),
      http.delete("/api/channels/by-id/ch-1/subscription", () =>
        HttpResponse.json({ subscribed: false, subscribersCount: 42 })
      )
    )
    render(
      <SessionProvider initialSession={logged}>
        <SubscribeButton channelId="ch-1" initial={{ subscribed: false, subscribersCount: 42 }} />
      </SessionProvider>
    )
    await user.click(screen.getByRole("button", { name: "Inscrever-se" }))
    expect(await screen.findByRole("button", { name: "Inscrito" })).toBeInTheDocument()
    expect(screen.getByText("43 inscritos")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Inscrito" }))
    await waitFor(() => expect(screen.getByText("42 inscritos")).toBeInTheDocument())
  })

  it("shows the 409 message when subscribing to the own channel", async () => {
    const user = userEvent.setup()
    server.use(
      http.put("/api/channels/by-id/self/subscription", () =>
        HttpResponse.json({ statusCode: 409, error: "SUBSCRIPTION_SELF", message: "Próprio canal", code: null }, { status: 409 })
      )
    )
    render(
      <SessionProvider initialSession={logged}>
        <SubscribeButton channelId="self" initial={{ subscribed: false, subscribersCount: 0 }} />
      </SessionProvider>
    )
    await user.click(screen.getByRole("button", { name: "Inscrever-se" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Próprio canal")
  })
})
