import "server-only";
import { redirect } from "next/navigation";

import { getSession, type SessionData } from "@/lib/auth/session";

/** Para páginas autenticadas (RSC): redireciona para /login sem sessão. */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");
  return session;
}
