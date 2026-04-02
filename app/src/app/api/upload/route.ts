import { NextRequest, NextResponse } from "next/server";
import { getApiSession, unauthorized } from "@/lib/api-helpers";
import { getSupabase } from "@/lib/supabase-admin";

async function getDropboxAccessToken(refreshToken: string, appKey: string, appSecret: string): Promise<string> {
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Dropbox 토큰 갱신 실패");
  return data.access_token;
}

export async function POST(request: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();

  const supabase = getSupabase();
  const { data: company } = await supabase
    .from("companies")
    .select("dropbox_app_key, dropbox_app_secret, dropbox_access_token, dropbox_path")
    .eq("id", session.company.id)
    .single();

  if (!company?.dropbox_app_key || !company?.dropbox_app_secret || !company?.dropbox_access_token) {
    return NextResponse.json({ error: "Dropbox 설정이 완료되지 않았습니다." }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const orderId = formData.get("orderId") as string;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    // Refresh token으로 access token 갱신
    const accessToken = await getDropboxAccessToken(
      company.dropbox_access_token,
      company.dropbox_app_key,
      company.dropbox_app_secret
    );

    // 파일 업로드
    const basePath = company.dropbox_path || "/attachments";
    const uploadPath = `${basePath}/${orderId || "general"}/${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    const uploadRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: uploadPath,
          mode: "add",
          autorename: true,
          mute: false,
        }),
        "Content-Type": "application/octet-stream",
      },
      body: fileBuffer,
    });

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) {
      throw new Error(uploadData.error_summary || "Dropbox 업로드 실패");
    }

    // 공유 링크 생성
    let shareUrl = "";
    try {
      const shareRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: uploadData.path_display }),
      });
      const shareData = await shareRes.json();
      shareUrl = shareData.url || "";
    } catch {
      // 공유 링크 생성 실패해도 업로드는 성공
    }

    // DB에 첨부파일 기록
    if (orderId) {
      await supabase.from("attachments").insert({
        order_id: orderId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        dropbox_path: uploadData.path_display,
        dropbox_url: shareUrl,
      });
    }

    return NextResponse.json({
      success: true,
      file_name: file.name,
      path: uploadData.path_display,
      url: shareUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "파일 업로드에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
