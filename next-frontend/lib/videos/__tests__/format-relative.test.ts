import { describe, expect, it } from "vitest";

import { formatRelative } from "../format";

describe("formatRelative", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  it.each([
    ["2026-09-04T11:59:50.000Z", "agora"],
    ["2026-09-04T11:58:00.000Z", "há 2 minutos"],
    ["2026-09-04T09:00:00.000Z", "há 3 horas"],
    ["2026-09-01T12:00:00.000Z", "há 3 dias"],
    ["2026-07-04T12:00:00.000Z", "há 2 meses"],
    ["2024-09-04T12:00:00.000Z", "há 2 anos"],
    [null, "—"],
  ])("%s → %s", (iso, expected) => {
    expect(formatRelative(iso, now)).toBe(expected);
  });
});
