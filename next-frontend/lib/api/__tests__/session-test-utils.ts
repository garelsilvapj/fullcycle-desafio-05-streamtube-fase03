/**
 * Cookie store em memória para o iron-session (mesmo padrão de session.test.ts).
 * Em cada arquivo de teste, no topo:
 *   vi.mock("next/headers", async () => (await import("@/lib/api/__tests__/session-test-utils")).cookiesModule())
 * e use `cookieMap` / `loginFixture()` / `params()`.
 */
export const cookieMap = new Map<string, string>();

export function cookiesModule() {
  return {
    cookies: () =>
      Promise.resolve({
        get: (name: string) =>
          cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
        set: (name: string, value: string) => {
          cookieMap.set(name, value);
        },
        delete: (name: string) => {
          cookieMap.delete(name);
        },
      }),
  };
}

export async function loginFixture(accessToken = "fixture-access-token") {
  const { setSession } = await import("@/lib/auth/session");
  await setSession({
    accessToken,
    refreshToken: "fixture-refresh-token",
    userId: "user-fixture-id",
    email: "alice@example.com",
    channelSlug: "alice",
  });
}

/** true quando não há sessão utilizável (cookie ausente ou destruído/vazio). */
export function sessionCleared(): boolean {
  return !cookieMap.get("streamtube_session");
}

export const params = (id: string) => ({ params: Promise.resolve({ id }) });
