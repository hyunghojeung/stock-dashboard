import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getApiSession, unauthorized } from "@/lib/api-helpers";
import { getSupabase } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();

  const { to, subject, html } = await request.json();

  if (!to || !subject) {
    return NextResponse.json({ error: "수신 이메일과 제목을 입력해주세요." }, { status: 400 });
  }

  // 업체의 이메일 설정 조회
  const supabase = getSupabase();
  const { data: company } = await supabase
    .from("companies")
    .select("mail_service, smtp_server, smtp_port, mail_email, mail_id, mail_password")
    .eq("id", session.company.id)
    .single();

  if (!company?.mail_id || !company?.mail_password) {
    return NextResponse.json({ error: "이메일 발송 설정이 완료되지 않았습니다. 관리자 > 업체정보설정에서 설정해주세요." }, { status: 400 });
  }

  const smtpConfig = {
    naver: { host: "smtp.naver.com", port: 465, secure: true },
    daum: { host: "smtp.daum.net", port: 465, secure: true },
  };

  const config = smtpConfig[company.mail_service as keyof typeof smtpConfig] || smtpConfig.naver;

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: company.mail_id,
        pass: company.mail_password,
      },
    });

    await transporter.sendMail({
      from: company.mail_email || `${company.mail_id}@naver.com`,
      to,
      subject,
      html: html || "",
    });

    return NextResponse.json({ success: true, message: "이메일이 발송되었습니다." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "이메일 발송에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
