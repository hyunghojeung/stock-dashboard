import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-admin";
import { getApiSession, unauthorized } from "@/lib/api-helpers";

export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("id, user_id, name, email, phone, role, created_at").eq("company_id", session.company.id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (session.user.role !== "admin") return NextResponse.json({ error: "관리자만 사용자를 등록할 수 있습니다." }, { status: 403 });
  const body = await request.json();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").insert({ ...body, company_id: session.company.id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
