import type { CommentItem, FollowedChannel, ReactionSummary, VideoSocial } from "@/lib/api/contracts";
import { buildChannel, CHANNEL_FIXTURE_ID } from "./channels";
import { buildVideo, VIDEO_FIXTURE_ID } from "./videos";

export const ROOT_COMMENT_ID = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
export const REPLY_COMMENT_ID = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c2";

export const buildReactionSummary = (overrides: Partial<ReactionSummary> = {}): ReactionSummary => ({
  likes: 12,
  dislikes: 1,
  myReaction: null,
  ...overrides,
});

export const buildComment = (overrides: Partial<CommentItem> = {}): CommentItem => ({
  id: ROOT_COMMENT_ID,
  videoId: VIDEO_FIXTURE_ID,
  parentId: null,
  body: "Primeiro comentário!",
  deleted: false,
  author: { id: CHANNEL_FIXTURE_ID, nickname: "alice", name: "Alice" },
  mine: false,
  reactions: buildReactionSummary({ likes: 2, dislikes: 0 }),
  createdAt: "2026-09-04T13:00:00.000Z",
  ...overrides,
});

export const buildCommentTree = (): CommentItem[] => [
  {
    ...buildComment(),
    replies: [
      buildComment({
        id: REPLY_COMMENT_ID,
        parentId: ROOT_COMMENT_ID,
        body: "Resposta do Bob",
        author: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nickname: "bob", name: "Bob" },
        reactions: buildReactionSummary({ likes: 0, dislikes: 0 }),
        createdAt: "2026-09-04T13:05:00.000Z",
      }),
    ],
  },
];

export const buildVideoSocial = (overrides: Partial<VideoSocial> = {}): VideoSocial => ({
  reactions: buildReactionSummary(),
  commentsCount: 2,
  subscription: { subscribed: false, subscribersCount: 42 },
  ...overrides,
});

export const buildFollowedChannel = (overrides: Partial<FollowedChannel> = {}): FollowedChannel => ({
  channel: buildChannel(),
  subscribersCount: 42,
  latestVideos: [buildVideo()],
  subscribedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});
