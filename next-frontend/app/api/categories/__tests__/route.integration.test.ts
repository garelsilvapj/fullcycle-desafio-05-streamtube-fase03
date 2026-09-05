import { beforeAll, describe, expect, it } from "vitest";

let GET: () => Promise<Response>;
beforeAll(async () => {
  ({ GET } = await import("@/app/api/categories/route"));
});

describe("GET /api/categories", () => {
  it("is public and passes the category list through", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const list = (await res.json()) as { slug: string }[];
    expect(list.map((c) => c.slug)).toEqual(["games", "musica", "tecnologia"]);
  });
});
