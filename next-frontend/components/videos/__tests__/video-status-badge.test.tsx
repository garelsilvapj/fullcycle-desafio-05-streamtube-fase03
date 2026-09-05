// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { VideoStatusBadge, videoStatusLabel } from "../video-status-badge"

describe("<VideoStatusBadge />", () => {
  it.each([
    ["uploading", "Enviando"],
    ["uploaded", "Na fila"],
    ["processing", "Processando"],
    ["ready", "Pronto"],
    ["failed", "Falhou"],
  ] as const)("renders %s as %s", (status, label) => {
    render(<VideoStatusBadge status={status} />)
    const badge = screen.getByText(label)
    expect(badge).toHaveAttribute("data-status", status)
    expect(videoStatusLabel(status)).toBe(label)
  })
})
