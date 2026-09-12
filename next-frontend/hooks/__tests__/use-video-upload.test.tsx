// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/mocks/server";
import { buildRegisterVideoResponse, buildVideo, VIDEO_FIXTURE_ID } from "@/mocks/factories/videos";
import { FakeXHR } from "@/lib/videos/__tests__/fake-xhr";
import { useVideoUpload } from "../use-video-upload";

const file = new File([new Uint8Array(1024)], "sample.mp4", { type: "video/mp4" });

function bffHandlers(status: "ready" | "failed" = "ready") {
  const calls: string[] = [];
  server.use(
    http.post("/api/videos", async ({ request }) => {
      calls.push(`POST /api/videos ${JSON.stringify(await request.json())}`);
      return HttpResponse.json(buildRegisterVideoResponse(), { status: 201 });
    }),
    http.post(`/api/videos/${VIDEO_FIXTURE_ID}/confirm`, () => {
      calls.push("POST confirm");
      return HttpResponse.json(buildVideo({ status: "uploaded", thumbnailUrl: null }));
    }),
    http.get(`/api/videos/${VIDEO_FIXTURE_ID}`, () => {
      calls.push("GET status");
      return HttpResponse.json(
        buildVideo({ status, error: status === "failed" ? "ffprobe falhou" : null }),
      );
    }),
    http.delete(`/api/videos/${VIDEO_FIXTURE_ID}`, () => {
      calls.push("DELETE video");
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

beforeEach(() => {
  FakeXHR.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});
afterEach(() => vi.unstubAllGlobals());

describe("useVideoUpload", () => {
  it("registers, uploads to the presigned URL, confirms and polls until ready", async () => {
    const calls = bffHandlers("ready");
    const { result } = renderHook(() => useVideoUpload({ pollIntervalMs: 10 }));

    await act(() => result.current.start({ title: "Meu vídeo", description: "", file }));

    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(result.current.state.progress).toBe(100);
    expect(result.current.state.video?.status).toBe("ready");
    expect(calls[0]).toContain('"title":"Meu vídeo"');
    expect(calls[0]).toContain('"sizeBytes":1024');
    expect(calls[0]).not.toContain("description");
    expect(calls.slice(1)).toEqual(["POST confirm", "GET status"]);
    expect(FakeXHR.instances[0].url).toContain("localhost:9000");
    expect(FakeXHR.instances[0].headers["content-type"]).toBe("video/mp4");
    expect(result.current.isBusy).toBe(false);
  });

  it("ends in `failed` with the worker error when processing fails", async () => {
    bffHandlers("failed");
    const { result } = renderHook(() => useVideoUpload({ pollIntervalMs: 10 }));
    await act(() => result.current.start({ title: "x", file }));
    await waitFor(() => expect(result.current.state.phase).toBe("failed"));
    expect(result.current.state.error).toBe("ffprobe falhou");
  });

  it("surfaces the BFF error message when registration fails", async () => {
    server.use(
      http.post("/api/videos", () =>
        HttpResponse.json(
          { statusCode: 400, error: "VALIDATION_ERROR", message: ["title should not be empty"], code: null },
          { status: 400 },
        ),
      ),
    );
    const { result } = renderHook(() => useVideoUpload({ pollIntervalMs: 10 }));
    await act(() => result.current.start({ title: "", file }));
    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error).toBe("title should not be empty");
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it("cancel during the upload aborts the PUT and deletes the draft", async () => {
    const calls = bffHandlers("ready");
    FakeXHR.autoRespond = null;
    const { result } = renderHook(() => useVideoUpload({ pollIntervalMs: 10 }));

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.start({ title: "x", file });
    });
    await waitFor(() => expect(result.current.state.phase).toBe("uploading"));
    act(() => result.current.cancel());
    await act(async () => {
      await pending;
    });

    await waitFor(() => expect(result.current.state.phase).toBe("canceled"));
    expect(calls).toContain("DELETE video");
    expect(calls).not.toContain("POST confirm");
  });
});
