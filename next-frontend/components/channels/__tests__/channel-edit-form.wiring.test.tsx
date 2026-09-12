// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildChannel } from "@/mocks/factories/channels"
import { server } from "@/mocks/server"
import { ChannelEditForm } from "../channel-edit-form"

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }))

beforeEach(() => refreshMock.mockClear())

describe("<ChannelEditForm /> wiring", () => {
  it("submits name/nickname/description and refreshes", async () => {
    const user = userEvent.setup()
    const received: Record<string, unknown>[] = []
    server.use(
      http.patch("/api/channels/me", async ({ request }) => {
        received.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(buildChannel({ nickname: "alice_studios" }))
      })
    )
    render(<ChannelEditForm channel={buildChannel()} />)
    const nickname = screen.getByLabelText(/Nickname/)
    await user.clear(nickname)
    await user.type(nickname, "alice_studios")
    await user.click(screen.getByRole("button", { name: "Salvar canal" }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(received[0]).toEqual({ name: "Alice", nickname: "alice_studios", description: "Canal da Alice" })
  })

  it("maps a 409 to the nickname field and validates the nickname format client-side", async () => {
    const user = userEvent.setup()
    server.use(
      http.patch("/api/channels/me", () =>
        HttpResponse.json(
          { statusCode: 409, error: "CHANNEL_NICKNAME_TAKEN", message: "Este nickname já está em uso", code: null },
          { status: 409 }
        )
      )
    )
    render(<ChannelEditForm channel={buildChannel()} />)
    const nickname = screen.getByLabelText(/Nickname/)
    await user.clear(nickname)
    await user.type(nickname, "Bad Name")
    await user.click(screen.getByRole("button", { name: "Salvar canal" }))
    expect(await screen.findByText(/letras minúsculas/)).toBeInTheDocument()

    await user.clear(nickname)
    await user.type(nickname, "taken")
    await user.click(screen.getByRole("button", { name: "Salvar canal" }))
    expect(await screen.findByText("Este nickname já está em uso")).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
