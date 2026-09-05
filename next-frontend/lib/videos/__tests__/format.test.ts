import { describe, expect, it } from "vitest";

import { formatBytes, formatDuration } from "../format";

describe("formatDuration", () => {
  it("formats seconds as m:ss and h:mm:ss", () => {
    expect(formatDuration(8)).toBe("0:08");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(136166)).toBe("133.0 KB");
    expect(formatBytes(6 * 1024 ** 3)).toBe("6.0 GB");
    expect(formatBytes(null)).toBe("—");
  });
});
