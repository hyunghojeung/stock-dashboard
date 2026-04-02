import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-admin";
import { getApiSession, unauthorized } from "@/lib/api-helpers";

// 작업 리스트 조회
export async function GET(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "40");
  const category = searchParams.get("category");
  const searchField = searchParams.get("searchField");
  const keyword = searchParams.get("keyword");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const supabase = getSupabase();
  let query = supabase
    .from("orders")
    .select("*, categories(name)", { count: "exact" })
    .eq("company_id", session.company.id)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (category && category !== "전체") {
    query = query.eq("categories.name", category);
  }
  if (startDate) query = query.gte("order_date", startDate);
  if (endDate) query = query.lte("order_date", endDate);

  if (keyword && searchField) {
    if (searchField === "거래처") query = query.ilike("client_name", `%${keyword}%`);
    else if (searchField === "주문자") query = query.ilike("orderer", `%${keyword}%`);
    else if (searchField === "연락처") query = query.ilike("contact", `%${keyword}%`);
    else if (searchField === "제목") query = query.ilike("title", `%${keyword}%`);
    else query = query.or(`client_name.ilike.%${keyword}%,orderer.ilike.%${keyword}%,title.ilike.%${keyword}%,contact.ilike.%${keyword}%`);
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, total: count, page, limit });
}

// 작업 등록
export async function POST(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();

  const body = await request.json();
  const supabase = getSupabase();

  // 주문번호 생성
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const { count } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("company_id", session.company.id)
    .like("order_no", `${dateStr}%`);

  const orderNo = `${dateStr}-${(count || 0) + 1}`;

  const { data, error } = await supabase
    .from("orders")
    .insert({
      ...body,
      company_id: session.company.id,
      created_by: session.user.id,
      order_no: orderNo,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
