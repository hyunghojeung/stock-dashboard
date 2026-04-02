export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-admin";
import { getApiSession, unauthorized } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 15;
  const supabase = getSupabase();
  const from = (page - 1) * limit;
  const { data, error, count } = await supabase.from("memos").select("*", { count: "exact" }).eq("company_id", session.company.id).order("created_at", { ascending: false }).range(from, from + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 작성자 정보 조회
  const createdByIds = (data || []).map((m: Record<string, unknown>) => m.created_by).filter(Boolean);
  let usersMap: Record<string, { name: string; user_id: string }> = {};
  if (createdByIds.length > 0) {
    const { data: usersData } = await supabase.from("users").select("id, name, user_id").in("id", createdByIds);
    if (usersData) {
      for (const u of usersData) {
        usersMap[u.id] = { name: u.name, user_id: u.user_id };
      }
    }
  }
  const result = (data || []).map((m: Record<string, unknown>) => ({ ...m, users: m.created_by ? usersMap[m.created_by as string] || null : null }));
  return NextResponse.json({ data: result, total: count, page, limit });
}

export async function POST(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const body = await request.json();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("memos").insert({ ...body, company_id: session.company.id, created_by: session.user.id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
