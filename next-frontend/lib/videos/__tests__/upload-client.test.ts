import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MultipartUploadPlan, SingleUploadPlan } from "@/lib/api/contracts";
import {
  putWithProgress,
  UploadAbortedError,
  uploadByPlan,
  UploadFailedError,
  uploadMultipart,
} from "../upload-client";
import { FakeXHR } from "./fake-xhr";

const blob = (size: number) => new Blob([new Uint8Array(size)]);

beforeEach(() => {
  FakeXHR.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});
afterEach(() => vi.unstubAllGlobals());

describe("putWithProgress", () => {
  it("does a PUT with the content type, reports progress and resolves with the ETag", async () => {
    const progress: number[] = [];
    const result = await putWithProgress("http://storage/put/a", blob(100), {
      contentType: "video/mp4",
      onProgress: ({ loaded }) => progress.push(loaded),
    });

    expect(result.etag).toBe('"etag-fixture"');
    const [xhr] = FakeXHR.instances;
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe("http://storage/put/a");
    expect(xhr.headers["content-type"]).toBe("video/mp4");
    expect(progress).toEqual([50, 100]);
  });

  it("rejects with UploadFailedError on a non-2xx status or network error", async () => {
    FakeXHR.autoRespond = { status: 403 };
    await expect(putWithProgress("http://storage/put/a", blob(10))).rejects.toBeInstanceOf(
      UploadFailedError,
    );
    FakeXHR.autoRespond = { status: 0, networkError: true };
    await expect(putWithProgress("http://storage/put/a", blob(10))).rejects.toThrow(/rede/);
  });

  it("aborts through the AbortSignal and rejects with UploadAbortedError", async () => {
    FakeXHR.autoRespond = null;
    const controller = new AbortController();
    const pending = putWithProgress("http://storage/put/a", blob(10), { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(UploadAbortedError);
  });
});

describe("uploadMultipart", () => {
  const plan: MultipartUploadPlan = {
    type: "multipart",
    uploadId: "up-1",
    partSize: 40,
    parts: [
      { partNumber: 1, url: "http://storage/part/1" },
      { partNumber: 2, url: "http://storage/part/2" },
      { partNumber: 3, url: "http://storage/part/3" },
    ],
  };

  it("slices the file by partSize, uploads every part and returns ordered ETags", async () => {
    const parts = await uploadMultipart(plan, blob(100), { concurrency: 2 });

    expect(parts).toEqual([
      { partNumber: 1, etag: '"etag-fixture"' },
      { partNumber: 2, etag: '"etag-fixture"' },
      { partNumber: 3, etag: '"etag-fixture"' },
    ]);
    const sizes = FakeXHR.instances
      .sort((a, b) => a.url.localeCompare(b.url))
      .map((x) => x.body?.size);
    expect(sizes).toEqual([40, 40, 20]);
  });

  it("aggregates progress across parts up to the file size", async () => {
    let last = { loaded: 0, total: 0 };
    await uploadMultipart(plan, blob(100), {
      concurrency: 1,
      onProgress: (p) => {
        last = p;
      },
    });
    expect(last).toEqual({ loaded: 100, total: 100 });
  });

  it("fails when the storage returns no ETag for a part", async () => {
    FakeXHR.autoRespond = { status: 200, etag: null };
    await expect(uploadMultipart(plan, blob(100))).rejects.toThrow(/ETag/);
  });
});

describe("uploadByPlan", () => {
  it("returns null for single plans and the parts for multipart plans", async () => {
    const single: SingleUploadPlan = { type: "single", url: "http://storage/put/single" };
    await expect(uploadByPlan(single, blob(5))).resolves.toBeNull();
    const multipart: MultipartUploadPlan = {
      type: "multipart",
      uploadId: "up",
      partSize: 10,
      parts: [{ partNumber: 1, url: "http://storage/part/1" }],
    };
    await expect(uploadByPlan(multipart, blob(5))).resolves.toHaveLength(1);
  });
});
