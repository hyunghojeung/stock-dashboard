import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-admin";
import { getApiSession, unauthorized } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = 20;
  const supabase = getSupabase();
  const from = (page - 1) * limit;
  const { data, error, count } = await supabase.from("purchase_orders").select("*, purchase_order_items(*)", { count: "exact" }).eq("company_id", session.company.id).order("po_date", { ascending: false }).range(from, from + limit - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count, page, limit });
}

export async function POST(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const body = await request.json();
  const supabase = getSupabase();
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const { count } = await supabase.from("purchase_orders").select("*", { count: "exact", head: true }).eq("company_id", session.company.id).like("po_no", `O${dateStr}%`);
  const poNo = `O${dateStr}-${(count || 0) + 1}`;
  const { data, error } = await supabase.from("purchase_orders").insert({ ...body, company_id: session.company.id, created_by: session.user.id, po_no: poNo }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
