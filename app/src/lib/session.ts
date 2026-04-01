import { cookies } from "next/headers";
import type { SessionData } from "@/types/database";

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session) return null;
  try {
    return JSON.parse(session.value) as SessionData;
  } catch {
    return null;
  }
}
