/**
 * BFF ↔ Components contracts barrel.
 *
 * This file is the **only** module in the project authorized to import `paths`
 * from `./types.gen`. Every Route Handler and every Component consumes BFF
 * shapes via named aliases exported from here — never by indexing `paths`
 * directly elsewhere.
 *
 * Two alias forms by convention:
 *
 * 1. **Pass-through alias** — BFF returns the upstream NestJS shape as-is.
 *    The alias indexes `paths` for the route's success-content type:
 *
 *      export type Video =
 *        paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];
 *
 * 2. **Reshape alias** — BFF projects a subset or composed shape. The alias
 *    name is named-only (does NOT index `paths`), making reshapes greppable
 *    against the wire shape:
 *
 *      export type VideoCard = Pick<Video, "id" | "title" | "thumbnailUrl">;
 *
 * Feature SIs append aliases here as endpoints are wired through the BFF.
 * The barrel starts empty by design.
 */
import type { paths } from "./types.gen";

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Request bodies (fields are empty in the current openapi.json — will expand as the upstream spec grows)
export type RegisterDto =
  paths["/auth/register"]["post"]["requestBody"]["content"]["application/json"];

export type LoginDto =
  paths["/auth/login"]["post"]["requestBody"]["content"]["application/json"];

export type ForgotPasswordDto =
  paths["/auth/forgot-password"]["post"]["requestBody"]["content"]["application/json"];

export type RefreshTokenDto =
  paths["/auth/refresh"]["post"]["requestBody"]["content"]["application/json"];

// Upstream success response bodies
export type RegisterResponse =
  paths["/auth/register"]["post"]["responses"][201]["content"]["application/json"];

// LoginTokenPair: upstream 200 body — BFF reads it to seal into the iron-session cookie;
// tokens never cross to the browser (per phase-02-auth-frontend/TD-02).
export type LoginTokenPair =
  paths["/auth/login"]["post"]["responses"][200]["content"]["application/json"];

export type RefreshTokenPair =
  paths["/auth/refresh"]["post"]["responses"][200]["content"]["application/json"];

// Shared error envelope (all auth 4xx responses)
export type ApiErrorEnvelope =
  paths["/auth/register"]["post"]["responses"][400]["content"]["application/json"];

// ─── Videos (Fase 03) ──────────────────────────────────────────────────────────

// Request bodies
export type RegisterVideoDto =
  paths["/videos"]["post"]["requestBody"]["content"]["application/json"];

export type CompleteMultipartDto =
  paths["/videos/{id}/multipart/complete"]["post"]["requestBody"]["content"]["application/json"];

export type AbortMultipartDto =
  paths["/videos/{id}/multipart/abort"]["post"]["requestBody"]["content"]["application/json"];

// Upstream success response bodies (pass-through)
export type Video =
  paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];

export type VideoList =
  paths["/videos"]["get"]["responses"][200]["content"]["application/json"];

export type RegisterVideoResponse =
  paths["/videos"]["post"]["responses"][201]["content"]["application/json"];

// Reshape aliases (named-only)
export type VideoStatus = Video["status"];
export type UploadPlan = RegisterVideoResponse["upload"];
export type SingleUploadPlan = Extract<UploadPlan, { type: "single" }>;
export type MultipartUploadPlan = Extract<UploadPlan, { type: "multipart" }>;
export type CompletedPart = CompleteMultipartDto["parts"][number];

// ─── Videos management + Channels + Categories (Fase 04) ──────────────────────

export type UpdateVideoDto =
  paths["/videos/{id}"]["patch"]["requestBody"]["content"]["application/json"];

export type ListVideosQuery = NonNullable<paths["/videos"]["get"]["parameters"]["query"]>;

export type PaginatedVideos =
  paths["/videos"]["get"]["responses"][200]["content"]["application/json"];

export type CreateThumbnailUploadDto =
  paths["/videos/{id}/thumbnail"]["post"]["requestBody"]["content"]["application/json"];

export type ThumbnailUploadPlan =
  paths["/videos/{id}/thumbnail"]["post"]["responses"][200]["content"]["application/json"];

export type Category =
  paths["/categories"]["get"]["responses"][200]["content"]["application/json"][number];

export type Channel =
  paths["/channels/me"]["get"]["responses"][200]["content"]["application/json"];

export type UpdateChannelDto =
  paths["/channels/me"]["patch"]["requestBody"]["content"]["application/json"];

export type PublicChannel =
  paths["/channels/{nickname}"]["get"]["responses"][200]["content"]["application/json"];

export type PublicChannelVideos =
  paths["/channels/{nickname}/videos"]["get"]["responses"][200]["content"]["application/json"];

// Reshape aliases
export type VideoVisibility = Video["visibility"];
