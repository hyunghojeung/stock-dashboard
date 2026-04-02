import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SessionData } from "@/types/database";

export async function getApiSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session) return null;
  try {
    return JSON.parse(session.value) as SessionData;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
}
