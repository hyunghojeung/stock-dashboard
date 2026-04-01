import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
}

export async function POST(request: NextRequest) {
  const { companyId, userId, password } = await request.json();

  if (!companyId || !userId || !password) {
    return NextResponse.json(
      { error: "모든 필드를 입력해주세요." },
      { status: 400 }
    );
  }

  // 1. 업체 조회
  const { data: company, error: companyError } = await getSupabase()
    .from("companies")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active")
    .single();

  if (companyError || !company) {
    return NextResponse.json(
      { error: "존재하지 않는 업체이거나 비활성 상태입니다." },
      { status: 401 }
    );
  }

  // 2. 사용자 조회
  const { data: user, error: userError } = await getSupabase()
    .from("users")
    .select("*")
    .eq("company_id", company.id)
    .eq("user_id", userId)
    .eq("password", password)
    .single();

  if (userError || !user) {
    return NextResponse.json(
      { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  // 3. 세션 쿠키 설정
  const sessionData = JSON.stringify({
    company: {
      id: company.id,
      company_id: company.company_id,
      company_name: company.company_name,
      business_number: company.business_number,
      representative: company.representative,
      phone: company.phone,
      fax: company.fax,
      email: company.email,
      address: company.address,
      business_type: company.business_type,
      business_category: company.business_category,
    },
    user: {
      id: user.id,
      user_id: user.user_id,
      name: user.name,
      role: user.role,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set("session", sessionData, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24시간
    path: "/",
  });

  return NextResponse.json({ success: true });
}
