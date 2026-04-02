import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-admin";
import { getApiSession, unauthorized } from "@/lib/api-helpers";

export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("companies").select("*").eq("id", session.company.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return NextResponse.json({ error: "관리자만 수정할 수 있습니다." }, { status: 403 });
  const body = await request.json();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("companies").update({ ...body, updated_at: new Date().toISOString() }).eq("id", session.company.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
