/**
 * Vercel Serverless Function: KIS 크레덴셜 클라우드 저장소
 * - Supabase에 KIS API 크레덴셜을 저장/조회
 * - 어떤 PC에서든 동일한 크레덴셜 사용 가능
 * - 사이트 인증 토큰(JWT) 필수
 */

import { verifyToken } from "./auth.js";

const SUPABASE_URL = "https://auwqsmfuejhrqegfhzxe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Z9ijvJRNlZ8UKx7ktlFNdg_swR3jF0Z";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Supabase REST API 호출 헬퍼
async function supabaseRest(path, options = {}) {
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers,
    },
  });
  const text = await resp.text();
  try {
    return { ok: resp.ok, status: resp.status, data: JSON.parse(text) };
  } catch {
    return { ok: resp.ok, status: resp.status, data: text };
  }
}

// 테이블 자동 생성 (service_role key 필요)
async function ensureTable() {
  // 테이블 존재 여부 확인
  const check = await supabaseRest("/kis_credentials?select=mode&limit=1");
  if (check.ok) return true;

  // 테이블이 없으면 생성 시도
  if (!SUPABASE_SERVICE_KEY) {
    console.warn("[credentials] service_role key가 없어 테이블 자동 생성 불가. Supabase 대시보드에서 수동 생성 필요.");
    return false;
  }

  // SQL로 테이블 생성
  const sql = `
    CREATE TABLE IF NOT EXISTS kis_credentials (
      mode TEXT PRIMARY KEY,
      app_key TEXT,
      app_secret TEXT,
      access_token TEXT,
      account_no TEXT,
      is_virtual BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE kis_credentials ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "anon_full_access" ON kis_credentials FOR ALL USING (true) WITH CHECK (true);
  `;

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (resp.ok) return true;

    // rpc가 없으면 pg-meta 사용
    const metaResp = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    return metaResp.ok;
  } catch (e) {
    console.error("[credentials] 테이블 생성 실패:", e.message);
    return false;
  }
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.status(200).end();

  // 인증 검증
  const authHeader = req.headers["authorization"] || "";
  const siteToken = authHeader.replace("Bearer ", "");
  if (!verifyToken(siteToken)) {
    return res.status(401).json({ error: "인증이 필요합니다" });
  }

  const fullUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const mode = fullUrl.searchParams.get("mode"); // 'virtual' | 'real'

  // GET: 크레덴셜 조회
  if (req.method === "GET") {
    const tableReady = await ensureTable();
    if (!tableReady) {
      return res.json({ credentials: null, message: "테이블 미생성 - Supabase 대시보드에서 kis_credentials 테이블을 생성해주세요" });
    }

    const filter = mode ? `?mode=eq.${mode}` : "?select=*";
    const result = await supabaseRest(`/kis_credentials${filter}`);
    if (!result.ok) {
      return res.json({ credentials: null });
    }

    if (mode) {
      return res.json({ credentials: result.data?.[0] || null });
    }
    // 모든 모드 반환
    const creds = {};
    for (const row of result.data || []) {
      creds[row.mode] = row;
    }
    return res.json({ credentials: creds });
  }

  // POST: 크레덴셜 저장
  if (req.method === "POST") {
    const tableReady = await ensureTable();
    if (!tableReady) {
      return res.status(503).json({ error: "테이블 미생성 - Supabase 대시보드에서 kis_credentials 테이블을 생성해주세요" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { app_key, app_secret, access_token, account_no, is_virtual } = body;
    const credMode = body.mode || (is_virtual !== false ? "virtual" : "real");

    const row = {
      mode: credMode,
      app_key: app_key || null,
      app_secret: app_secret || null,
      access_token: access_token || null,
      account_no: account_no || null,
      is_virtual: credMode === "virtual",
      updated_at: new Date().toISOString(),
    };

    // Upsert (mode가 PK)
    const result = await supabaseRest("/kis_credentials", {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify(row),
    });

    if (result.ok) {
      return res.json({ success: true, credentials: result.data?.[0] || row });
    }
    return res.status(500).json({ error: "저장 실패", detail: result.data });
  }

  return res.status(405).end();
}
