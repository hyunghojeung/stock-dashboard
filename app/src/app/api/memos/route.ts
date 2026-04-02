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
  const { data, error, count } = await supabase.from("memos").select("*, users!memos_created_by_fkey(name)", { count: "exact" }).eq("company_id", session.company.id).order("created_at", { ascending: false }).range(from, from + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count, page, limit });
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
