import type { RegisterVideoResponse, Video } from "@/lib/api/contracts";

export const VIDEO_FIXTURE_ID = "11111111-1111-4111-8111-111111111111";

const baseVideo: Video = {
  id: VIDEO_FIXTURE_ID,
  slug: "aB3dE5fG7hI",
  title: "Vídeo de exemplo",
  description: "Descrição do vídeo de exemplo",
  status: "ready",
  durationSec: 8,
  sizeBytes: 136166,
  thumbnailUrl: `/videos/${VIDEO_FIXTURE_ID}/thumbnail`,
  error: null,
  createdAt: "2026-09-04T12:00:00.000Z",
  updatedAt: "2026-09-04T12:05:00.000Z",
};

export const buildVideo = (overrides: Partial<Video> = {}): Video => ({
  ...baseVideo,
  ...overrides,
});

/** Lista determinística com um vídeo em cada estado relevante para a UI. */
export const buildVideoList = (): Video[] => [
  buildVideo(),
  buildVideo({
    id: "22222222-2222-4222-8222-222222222222",
    slug: "pR0cE5s1nG0",
    title: "Vídeo em processamento",
    status: "processing",
    durationSec: null,
    sizeBytes: 5_000_000,
    thumbnailUrl: null,
    updatedAt: "2026-09-04T12:01:00.000Z",
  }),
  buildVideo({
    id: "33333333-3333-4333-8333-333333333333",
    slug: "fA1lEd00000",
    title: "Vídeo com falha",
    status: "failed",
    durationSec: null,
    thumbnailUrl: null,
    error: "ffprobe falhou: Invalid data found when processing input",
    updatedAt: "2026-09-04T12:02:00.000Z",
  }),
];

export const buildRegisterVideoResponse = (
  overrides: Partial<RegisterVideoResponse> = {},
): RegisterVideoResponse => ({
  video: buildVideo({ status: "uploading", durationSec: null, sizeBytes: null, thumbnailUrl: null }),
  upload: {
    type: "single",
    url: `http://localhost:9000/streamtube-videos/put/${VIDEO_FIXTURE_ID}/original`,
  },
  ...overrides,
});
