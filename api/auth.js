/**
 * Vercel Serverless Function: 비밀번호 인증
 * - 비밀번호 검증 후 서명된 토큰 반환
 * - 토큰 검증 기능 export (다른 API에서 사용)
 */

import crypto from "crypto";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "4332";
const JWT_SECRET = process.env.JWT_SECRET || "stock-dashboard-mark1-secret-2026";

// 서명된 토큰 생성 (7일 유효)
function createToken() {
  const payload = {
    auth: true,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

// 토큰 검증 (api/kis.js 등에서 import하여 사용)
export function verifyToken(token) {
  try {
    if (!token) return null;
    const [data, signature] = token.split(".");
    if (!data || !signature) return null;
    const expected = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(data)
      .digest("base64url");
    if (signature !== expected) return null;
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    );
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.status(200).end();

  // POST: 비밀번호 검증
  if (req.method === "POST") {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (body.password === SITE_PASSWORD) {
      return res.json({ authenticated: true, token: createToken() });
    }
    return res.status(401).json({ authenticated: false, message: "비밀번호가 틀렸습니다" });
  }

  // GET: 토큰 유효성 검증
  if (req.method === "GET") {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    const payload = verifyToken(token);
    if (payload) {
      return res.json({ valid: true });
    }
    return res.status(401).json({ valid: false });
  }

  return res.status(405).end();
}
