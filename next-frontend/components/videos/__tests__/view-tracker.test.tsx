// @vitest-environment jsdom
import { fireEvent, render, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { server } from "@/mocks/server"
import { ViewTracker } from "../view-tracker"

describe("<ViewTracker />", () => {
  it("POSTs a view once on the first play of the player", async () => {
    const onCall = vi.fn()
    server.use(
      http.post("/api/videos/v-1/views", () => {
        onCall()
        return new HttpResponse(null, { status: 204 })
      })
    )
    render(
      <>
        <video data-slot="video-player" />
        <ViewTracker videoId="v-1" />
      </>
    )
    const player = document.querySelector("video") as HTMLVideoElement
    fireEvent.play(player)
    fireEvent.play(player)
    await waitFor(() => expect(onCall).toHaveBeenCalledTimes(1))
  })
})
