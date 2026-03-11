import { useState, useEffect, useCallback, useRef } from "react";
import { encryptCredentials, decryptCredentials } from "./kisCrypto";
import { supabase } from "./supabaseClient";

// KIS credentials: 메모리 캐시 + localStorage + 클라우드(Supabase) 동기화
// 모의투자/실전투자 각각 별도 저장
const KIS_STORAGE_KEY = "kis_credentials";
const KIS_VIRTUAL_KEY = "kis_credentials_virtual";
const KIS_REAL_KEY = "kis_credentials_real";
const KIS_ACTIVE_MODE_KEY = "kis_active_mode"; // 'virtual' | 'real'
let _kisCache = {};
let _decryptPromise = null; // 비동기 복호화 중복 방지

// ── 클라우드 동기화 헬퍼 ──
async function cloudSave(creds, mode) {
  try {
    const token = localStorage.getItem("__site_token__") || "";
    if (!token) return;
    await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...creds, mode }),
    });
  } catch (e) { console.warn("[KIS Cloud] 저장 실패:", e.message); }
}

async function cloudLoad(mode) {
  try {
    const token = localStorage.getItem("__site_token__") || "";
    if (!token) return null;
    const url = mode ? `/api/credentials?mode=${mode}` : "/api/credentials";
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const data = await r.json();
    return data.credentials;
  } catch { return null; }
}

// 동기 버전: 캐시에서만 읽기 (이미 복호화된 상태)
export function getKisCredentials(mode) {
  if (mode === 'virtual' || mode === 'real') {
    const cacheKey = `_mode_${mode}`;
    if (_kisCache[cacheKey]) return _kisCache[cacheKey];
    return {};
  }
  if (_kisCache.access_token) return _kisCache;
  return {};
}

// 비동기 버전: localStorage → 클라우드 순서로 로드
export async function loadKisCredentials(mode) {
  if (mode === 'virtual' || mode === 'real') {
    const key = mode === 'virtual' ? KIS_VIRTUAL_KEY : KIS_REAL_KEY;
    const cacheKey = `_mode_${mode}`;
    try {
      // 1. localStorage에서 로드
      const raw = JSON.parse(localStorage.getItem(key) || "{}");
      const decrypted = await decryptCredentials(raw);
      if (decrypted.app_key) {
        _kisCache[cacheKey] = decrypted;
        return decrypted;
      }
      // 2. localStorage에 없으면 클라우드에서 로드
      const cloud = await cloudLoad(mode);
      if (cloud && cloud.app_key) {
        const merged = { ...cloud, is_virtual: mode === 'virtual' };
        _kisCache[cacheKey] = merged;
        // 로컬에도 캐싱
        const encrypted = await encryptCredentials(merged);
        try { localStorage.setItem(key, JSON.stringify(encrypted)); } catch {}
        return merged;
      }
      _kisCache[cacheKey] = decrypted;
      return decrypted;
    } catch { return {}; }
  }
  if (_kisCache.access_token) return _kisCache;
  try {
    const raw = JSON.parse(localStorage.getItem(KIS_STORAGE_KEY) || "{}");
    const decrypted = await decryptCredentials(raw);
    if (decrypted.access_token) _kisCache = { ..._kisCache, ...decrypted };
    return decrypted;
  } catch { return _kisCache; }
}

export function getKisActiveMode() {
  try { return localStorage.getItem(KIS_ACTIVE_MODE_KEY) || 'virtual'; } catch { return 'virtual'; }
}

async function saveKisCredentials(creds) {
  _kisCache = { ..._kisCache, ...creds };
  const mode = creds.is_virtual !== false ? 'virtual' : 'real';
  const cacheKey = `_mode_${mode}`;
  _kisCache[cacheKey] = creds;
  // localStorage에 암호화 저장
  const encrypted = await encryptCredentials(creds);
  try { localStorage.setItem(KIS_STORAGE_KEY, JSON.stringify(encrypted)); } catch {}
  const modeKey = creds.is_virtual !== false ? KIS_VIRTUAL_KEY : KIS_REAL_KEY;
  try { localStorage.setItem(modeKey, JSON.stringify(encrypted)); } catch {}
  try { localStorage.setItem(KIS_ACTIVE_MODE_KEY, mode); } catch {}
  // 클라우드에도 동기화 (비동기, 실패해도 무시)
  cloudSave(creds, mode);
  // ★ Supabase kis_credentials 테이블에도 동기화 (서버사이드 자동매매용)
  syncCredentialsToSupabase(creds, mode);
}

// ★ 서버사이드 자동매매를 위해 KIS 인증정보를 Supabase에 저장
async function syncCredentialsToSupabase(creds, mode) {
  try {
    if (!creds.app_key || !creds.app_secret) return;
    const isVirtual = mode === 'virtual';
    const accountNo = (creds.account_no || '').replace(/-/g, '');

    const payload = {
      mode,
      app_key: creds.app_key,
      app_secret: creds.app_secret,
      access_token: creds.access_token || '',
      account_no: accountNo,
      is_virtual: isVirtual,
      updated_at: new Date().toISOString(),
    };

    // upsert: mode 기준으로 있으면 update, 없으면 insert
    const { data: existing } = await supabase
      .from('kis_credentials')
      .select('id')
      .eq('mode', mode)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase.from('kis_credentials').update(payload).eq('mode', mode);
    } else {
      payload.created_at = new Date().toISOString();
      await supabase.from('kis_credentials').insert(payload);
    }
    console.log(`[KIS] Supabase 인증정보 동기화 완료 (${mode})`);
  } catch (e) {
    console.warn('[KIS] Supabase 인증정보 동기화 실패:', e.message);
  }
}

// 특정 모드의 크레덴셜을 활성화
export async function activateKisMode(mode) {
  const creds = await loadKisCredentials(mode);
  creds.is_virtual = mode === 'virtual';
  _kisCache = { ..._kisCache, ...creds };
  const cacheKey = `_mode_${mode}`;
  _kisCache[cacheKey] = creds;
  const encrypted = await encryptCredentials(creds);
  try { localStorage.setItem(KIS_STORAGE_KEY, JSON.stringify(encrypted)); } catch {}
  try { localStorage.setItem(KIS_ACTIVE_MODE_KEY, mode); } catch {}
  return !!creds.access_token;
}

// 앱 초기화 시 호출: localStorage → 클라우드 순서로 크레덴셜 로드
export async function initKisCredentials() {
  if (_decryptPromise) return _decryptPromise;
  _decryptPromise = (async () => {
    await loadKisCredentials('virtual');
    await loadKisCredentials('real');
    await loadKisCredentials();
  })();
  return _decryptPromise;
}

// 토큰 자동 갱신 (app_key/app_secret이 저장되어 있으면 새 토큰 발급)
export async function refreshKisToken(mode) {
  const creds = await loadKisCredentials(mode);
  if (!creds.app_key || !creds.app_secret || !creds.account_no) return false;
  try {
    const isV = mode === 'virtual';
    const r = await kisApi("config", {}, {
      method: "POST",
      body: JSON.stringify({ app_key: creds.app_key, app_secret: creds.app_secret, account_no: creds.account_no, is_virtual: isV }),
    });
    if (r?.success && r.access_token) {
      const updated = { ...creds, access_token: r.access_token, is_virtual: isV };
      await saveKisCredentials(updated);
      console.log(`[KIS] Token refreshed for ${mode} mode`);
      return true;
    }
  } catch (e) { console.warn("[KIS] Token refresh failed:", e.message); }
  return false;
}

export async function kisApi(route, params = {}, options = {}) {
  try {
    // 캐시에 없으면 비동기 로드
    let creds = getKisCredentials();
    if (!creds.access_token) creds = await loadKisCredentials();
    const activeMode = getKisActiveMode();
    const isVirtual = creds.is_virtual !== undefined ? creds.is_virtual : (activeMode === 'virtual');

    const url = new URL("/api/kis", window.location.origin);
    // ★ 보안: 크레덴셜은 헤더로만 전송 (URL 쿼리에 노출하지 않음)
    url.searchParams.set("_route", route);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v); });

    // 사이트 인증 토큰 + KIS 크레덴셜을 HTTP 헤더로 전송
    const siteToken = localStorage.getItem("__site_token__") || "";
    const headers = {
      "Content-Type": "application/json",
      ...(siteToken && { "Authorization": `Bearer ${siteToken}` }),
      ...(creds.app_key && { "x-kis-appkey": creds.app_key }),
      ...(creds.app_secret && { "x-kis-appsecret": creds.app_secret }),
      ...(creds.account_no && { "x-kis-account": creds.account_no }),
      "x-kis-virtual": String(isVirtual),
      ...(creds.access_token && { "x-kis-token": creds.access_token }),
      ...options.headers,
    };
    const res = await fetch(url.toString(), { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      console.warn("[KIS] Error:", route, data?.detail);
      return { success: false, detail: data?.detail || `오류 ${res.status}` };
    }
    return data;
  } catch (e) {
    console.error("[KIS] Fetch error:", route, e.message);
    return { success: false, detail: `네트워크 오류: ${e.message}` };
  }
}

// 주요 종목 매핑 (프론트엔드 내장 — 서버 검색 실패 시 폴백)
const STOCK_MAP = [
  ["005930","삼성전자"],["000660","SK하이닉스"],["373220","LG에너지솔루션"],["207940","삼성바이오로직스"],
  ["005935","삼성전자우"],["006400","삼성SDI"],["051910","LG화학"],["005490","POSCO홀딩스"],
  ["035420","NAVER"],["000270","기아"],["005380","현대차"],["068270","셀트리온"],
  ["035720","카카오"],["003550","LG"],["105560","KB금융"],["055550","신한지주"],
  ["028260","삼성물산"],["012330","현대모비스"],["066570","LG전자"],["032830","삼성생명"],
  ["316140","우리금융지주"],["003670","포스코퓨처엠"],["086790","하나금융지주"],["034730","SK"],
  ["018260","삼성에스디에스"],["015760","한국전력"],["138040","메리츠금융지주"],["009150","삼성전기"],
  ["033780","KT&G"],["030200","KT"],["011200","HMM"],["017670","SK텔레콤"],
  ["010130","고려아연"],["034020","두산에너빌리티"],["010950","S-Oil"],["259960","크래프톤"],
  ["036570","엔씨소프트"],["003490","대한항공"],["000810","삼성화재"],["329180","현대중공업"],
  ["047050","포스코인터내셔널"],["090430","아모레퍼시픽"],["011170","롯데케미칼"],["096770","SK이노베이션"],
  ["352820","하이브"],["000720","현대건설"],["180640","한진칼"],["004020","현대제철"],
  ["323410","카카오뱅크"],["377300","카카오페이"],["263750","펄어비스"],["302440","SK바이오사이언스"],
  ["247540","에코프로비엠"],["086520","에코프로"],["010140","삼성중공업"],["009540","한국조선해양"],
  ["042700","한미반도체"],["041510","에스엠"],["035900","JYP Ent."],["122870","와이지엔터테인먼트"],
  ["028050","삼성엔지니어링"],["002790","아모레G"],["069500","KODEX 200"],["252670","KODEX 200선물인버스2X"],
  ["251340","KODEX 코스닥150레버리지"],["114800","KODEX 인버스"],["229200","KODEX 코스닥150"],
  ["005830","DB손해보험"],["011790","SKC"],["006800","미래에셋증권"],["024110","기업은행"],
  ["161390","한국타이어앤테크놀로지"],["267250","HD현대"],["004490","세방전지"],["009830","한화솔루션"],
  ["272210","한화시스템"],["042660","한화오션"],["000880","한화"],["012450","한화에어로스페이스"],
];

function localStockSearch(keyword) {
  const kw = keyword.toLowerCase();
  return STOCK_MAP.filter(([, name]) => name.toLowerCase().includes(kw))
    .map(([code, name]) => ({ code, name }));
}

// 종목명(한글) → 종목코드 변환 (숫자면 그대로 반환)
async function resolveStockCode(input) {
  const v = (input || "").trim();
  if (!v) return "";
  if (/^\d{1,6}$/.test(v)) return v;
  // 1차: 로컬 매핑에서 검색
  const local = localStockSearch(v);
  if (local.length > 0) return local[0].code;
  // 2차: 서버 API 검색 (KRX)
  try {
    const url = new URL("/api/kis", window.location.origin);
    url.searchParams.set("_route", "search");
    url.searchParams.set("keyword", v);
    const r = await fetch(url).then(r => r.json());
    if (r.results?.length) return r.results[0].code;
  } catch {}
  return v;
}

const fmt = (n) => n?.toLocaleString("ko-KR") ?? "—";
const fmtWon = (n) => n != null ? `${n >= 0 ? "+" : ""}${n.toLocaleString("ko-KR")}원` : "—";
const fmtPct = (n) => n != null ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "—";
const clr = (n) => (n > 0 ? "#ff4444" : n < 0 ? "#4488ff" : "#8899aa");

// ============================================================
// Styles
// ============================================================
const S = {
  panel: { background: "linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 16 },
  title: { color: "#e0e6f0", fontWeight: 600, fontSize: 15, marginBottom: 12 },
  input: { width: "100%", padding: "10px 14px", background: "rgba(10,18,40,0.8)", border: "1px solid rgba(100,140,200,0.2)", borderRadius: 8, color: "#e0e6f0", fontSize: 13, outline: "none", fontFamily: "'JetBrains Mono',monospace" },
  btn: (color = "#1a3a6e", hoverColor = "#2a5098") => ({ padding: "10px 20px", background: `linear-gradient(135deg,${color},${hoverColor})`, color: "#e0e6f0", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  label: { color: "#6688aa", fontSize: 12, marginBottom: 4, display: "block" },
  th: { padding: "8px 6px", color: "#6688aa", textAlign: "left", fontSize: 12, borderBottom: "1px solid rgba(100,140,200,0.2)" },
  td: { padding: "8px 6px", fontSize: 12, borderBottom: "1px solid rgba(100,140,200,0.08)" },
};

// ============================================================
// Global Auto-Trade Monitor (runs in background, independent of component)
// 매입 완료 즉시 자동 손절/익절 모니터링 시작
// ============================================================
const _autoTrade = { interval: {}, running: {}, logs: {} };
const AUTO_TRADE_RULES_KEY = "kis_auto_trade_rules";
const BACKEND_API = "https://web-production-139e9.up.railway.app";

// 규칙을 백엔드(Railway)에 동기화하는 헬퍼
async function syncRulesToBackend(mode, rules) {
  try {
    const payload = rules.filter(r => r.enabled).map(r => ({
      mode,
      stock_code: r.stock_code,
      stock_name: r.stock_name || "",
      buy_price: r.buy_price || 0,
      quantity: r.quantity || 0,
      tp_pct: r.take_profit_pct ?? r.tp_pct ?? 10,
      sl_pct: r.stop_loss_pct ?? r.sl_pct ?? 5,
      max_hold_days: r.max_hold_days ?? 30,
      buy_date: r.buy_date || new Date().toISOString().slice(0, 10),
      enabled: true,
      // ★ 스마트형 트레일링 스탑 필드
      strategy: r.strategy || 'fixed',
      trailing_stop_pct: r.trailing_stop_pct ?? 5,
      profit_activation_pct: r.profit_activation_pct ?? 15,
      grace_days: r.grace_days ?? 7,
      peak_price: r.peak_price ?? 0,
    }));
    await fetch(`${BACKEND_API}/api/kis/auto-trade/rules/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, rules: payload }),
    });
  } catch (e) {
    console.warn("[서버 자동매매] 규칙 동기화 실패:", e.message);
  }
}

export function startKisAutoTrade(mode = 'virtual', intervalSec = 30) {
  if (_autoTrade.running[mode]) return; // already running
  _autoTrade.running[mode] = true;
  _autoTrade.logs[mode] = _autoTrade.logs[mode] || [];

  const atLog = (msg) => {
    _autoTrade.logs[mode] = [{ time: new Date().toLocaleTimeString('ko-KR'), msg }, ...(_autoTrade.logs[mode] || [])].slice(0, 50);
  };

  const check = async () => {
    let rules;
    try { rules = JSON.parse(localStorage.getItem(`${AUTO_TRADE_RULES_KEY}_${mode}`) || '[]'); } catch { rules = []; }
    const activeRules = rules.filter(r => r.enabled);
    if (activeRules.length === 0) { atLog("활성 규칙 없음 (보유종목 매칭 0건)"); return; }

    activateKisMode(mode);
    atLog("잔고 조회 중...");
    const bal = await kisApi("balance");
    if (!bal?.success) { atLog("❌ 잔고 조회 실패"); return; }

    const posMap = {};
    (bal.positions || []).forEach(p => { posMap[p.stock_code] = p; });

    atLog(`${activeRules.length}개 종목 모니터링 중...`);
    for (const rule of activeRules) {
      const pos = posMap[rule.stock_code];
      if (!pos) continue;
      const profitRate = pos.profit_rate || 0;
      const holdDays = rule.buy_date ? Math.floor((Date.now() - new Date(rule.buy_date).getTime()) / 86400000) : 0;
      const stratType = rule.strategy || 'fixed';

      let reason = null;

      if (stratType === 'smart') {
        // ━━━ 스마트형: 트레일링 스탑 (클라이언트사이드 보조) ━━━
        const grace = rule.grace_days ?? 7;
        const sl = rule.stop_loss_pct ?? 12;
        const trailing = rule.trailing_stop_pct ?? 5;
        const activation = rule.profit_activation_pct ?? 15;
        let peak = rule.peak_price ?? 0;
        // peak_price 업데이트 (로컬)
        if (pos.current_price > peak) {
          peak = pos.current_price;
          rule.peak_price = peak;
          try { localStorage.setItem(`${AUTO_TRADE_RULES_KEY}_${mode}`, JSON.stringify(rules)); } catch {}
        }
        if (holdDays > grace) {
          const peakProfit = peak > 0 && rule.buy_price > 0 ? ((peak - rule.buy_price) / rule.buy_price * 100) : 0;
          if (peakProfit >= activation && peak > 0) {
            const dropFromPeak = ((pos.current_price - peak) / peak * 100);
            if (dropFromPeak <= -trailing) {
              reason = `트레일링 (최고${peakProfit.toFixed(1)}%→현재${profitRate.toFixed(1)}%, 하락${dropFromPeak.toFixed(1)}%)`;
            }
          }
          if (!reason && profitRate <= -sl) {
            reason = `손절 (${profitRate.toFixed(2)}% ≤ -${sl}%)`;
          }
        }
        if (!reason && rule.max_hold_days > 0 && holdDays >= rule.max_hold_days) {
          reason = `만기매도 (${holdDays}일 ≥ ${rule.max_hold_days}일)`;
        }
      } else {
        // ━━━ 고정형: 기존 로직 ━━━
        if (profitRate >= rule.take_profit_pct) reason = `익절 (${profitRate.toFixed(2)}% ≥ ${rule.take_profit_pct}%)`;
        else if (profitRate <= -rule.stop_loss_pct) reason = `손절 (${profitRate.toFixed(2)}% ≤ -${rule.stop_loss_pct}%)`;
        else if (rule.max_hold_days > 0 && holdDays >= rule.max_hold_days) reason = `만기매도 (${holdDays}일 ≥ ${rule.max_hold_days}일)`;
      }

      if (!reason) {
        const tag = stratType === 'smart' ? '[스마트]' : '[고정]';
        atLog(`  ${pos.stock_name} ${tag} 수익률 ${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}% → 유지`);
        continue;
      }

      atLog(`🔔 ${pos.stock_name} ${reason} → 시장가 매도 실행`);
      const sellResult = await kisApi("order/sell", {}, {
        method: "POST",
        body: JSON.stringify({ stock_code: pos.stock_code, qty: pos.qty, price: 0, order_type: "01" }),
      });
      if (sellResult?.success) {
        atLog(`✅ ${pos.stock_name} 매도 성공! 주문번호: ${sellResult.order_no}`);
        // 매매 일지 기록
        try {
          await supabase.from('trade_journal').insert({
            mode: mode === 'real' ? 'real' : 'mock',
            trade_type: 'sell', stock_code: pos.stock_code, stock_name: pos.stock_name,
            price: pos.current_price, quantity: pos.qty, amount: pos.current_price * pos.qty,
            realized_pnl: pos.profit_loss || 0, realized_pnl_pct: Math.round((pos.profit_rate || 0) * 100) / 100,
            cash_balance: (bal.summary?.deposit || 0) + pos.eval_amount,
            order_no: sellResult.order_no || '', memo: `자동매매(BG) ${reason}`,
            trade_date: new Date().toISOString(),
          });
        } catch {}
        // 규칙 비활성화
        rules = rules.map(r => r.stock_code === pos.stock_code ? { ...r, enabled: false } : r);
        try { localStorage.setItem(`${AUTO_TRADE_RULES_KEY}_${mode}`, JSON.stringify(rules)); } catch {}
      } else {
        atLog(`❌ ${pos.stock_name} 매도 실패: ${sellResult?.message || '알 수 없는 오류'}`);
      }
    }
    atLog("체크 완료");
  };

  atLog(`▶️ 백그라운드 자동매매 시작 (${intervalSec}초 간격)`);
  check();
  _autoTrade.interval[mode] = setInterval(check, intervalSec * 1000);
}

export function stopKisAutoTrade(mode) {
  clearInterval(_autoTrade.interval[mode]);
  _autoTrade.running[mode] = false;
  delete _autoTrade.interval[mode];
}

export function isKisAutoTradeRunning(mode) {
  return !!_autoTrade.running[mode];
}

export function getKisAutoTradeLogs(mode) {
  return _autoTrade.logs[mode] || [];
}

// 매수 주문 후 자동매매 규칙 생성 + 즉시 모니터링 시작
export function setupAutoTradeAfterBuy(mode, boughtStocks, strategy) {
  const storageKey = `${AUTO_TRADE_RULES_KEY}_${mode}`;
  let rules;
  try { rules = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { rules = []; }

  const existing = new Set(rules.map(r => r.stock_code));
  const tp = strategy?.tp ?? 7;
  const sl = strategy?.sl ?? 3;
  const days = strategy?.days ?? 10;
  // ★ 스마트형 트레일링 스탑 파라미터
  const trailing = strategy?.trailing ?? 0;
  const grace = strategy?.grace ?? 0;
  const activation = strategy?.activation ?? 15;
  const strategyType = trailing > 0 ? 'smart' : 'fixed';

  for (const stock of boughtStocks) {
    if (!existing.has(stock.code)) {
      rules.push({
        stock_code: stock.code, stock_name: stock.name,
        buy_price: stock.price || 0, quantity: stock.qty || 0,
        take_profit_pct: tp, stop_loss_pct: sl, max_hold_days: days,
        enabled: true, buy_date: new Date().toISOString().slice(0, 10),
        // ★ 전략 필드
        strategy: strategyType,
        trailing_stop_pct: trailing,
        profit_activation_pct: activation,
        grace_days: grace,
        peak_price: 0,
      });
    }
  }

  try { localStorage.setItem(storageKey, JSON.stringify(rules)); } catch {}

  // ★ 서버사이드 자동매매를 위해 백엔드에도 규칙 동기화
  syncRulesToBackend(mode, rules);

  // 모니터링 시작 (이미 실행 중이면 무시)
  startKisAutoTrade(mode, 30);
}

// ============================================================
// KIS Trading Component
// ============================================================
export default function KisTrading({ mode = "virtual" }) {
  const isVirtual = mode === "virtual";
  const [tab, setTab] = useState("config");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load KIS status from encrypted localStorage + auto-refresh token
  useEffect(() => {
    (async () => {
      await activateKisMode(mode);
      const creds = await loadKisCredentials(mode);
      const configured = !!(creds.app_key && creds.app_secret && creds.account_no);
      const tokenValid = !!creds.access_token;

      const updateStatus = (c) => {
        const conf = !!(c.app_key && c.app_secret && c.account_no);
        const tok = !!c.access_token;
        setStatus({
          configured: conf, token_valid: tok, is_virtual: isVirtual,
          account_no: c.account_no ? c.account_no.replace(/-/g, "").slice(0, 4) + "****" + c.account_no.replace(/-/g, "").slice(-2) : "",
        });
        if (conf && tok) setTab(prev => prev === "config" ? "balance" : prev);
      };

      updateStatus(creds);
      setLoading(false);

      // ★ KIS 페이지 진입 시 자동으로 Supabase에 인증정보 동기화 (서버사이드 자동매매용)
      if (configured) {
        syncCredentialsToSupabase(creds, mode);
      }

      if (configured && !tokenValid) {
        const ok = await refreshKisToken(mode);
        if (ok) {
          const refreshedCreds = await loadKisCredentials(mode);
          updateStatus(refreshedCreds);
          syncCredentialsToSupabase(refreshedCreds, mode);
        }
      } else if (configured && tokenValid) {
        setTab("balance");
        const ok = await refreshKisToken(mode);
        if (ok) {
          const refreshedCreds = await loadKisCredentials(mode);
          updateStatus(refreshedCreds);
          syncCredentialsToSupabase(refreshedCreds, mode);
        }
      }
    })();
  }, [mode]);

  const tabs = [
    { id: "config", label: "API 설정", icon: "🔑" },
    { id: "balance", label: "대시보드", icon: "💰" },
    { id: "autotrade", label: "자동매매", icon: "🤖" },
    { id: "order", label: "주문", icon: "📝" },
    { id: "orders", label: "주문내역", icon: "📋" },
    { id: "quote", label: "시세조회", icon: "📈" },
    { id: "asking", label: "호가", icon: "📊" },
    { id: "finance", label: "재무정보", icon: "📑" },
  ];

  // 렌더 시 해당 모드의 크레덴셜이 캐시에 로드되어 있도록 useEffect에서 처리

  const titleLabel = isVirtual ? "KIS 모의투자" : "KIS 실전투자";
  const titleIcon = isVirtual ? "🏦" : "🔴";
  const accentColor = isVirtual ? undefined : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status Bar */}
      <div style={{ ...S.panel, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>{titleIcon}</span>
          <span style={{ color: accentColor || "#e0e6f0", fontWeight: 600, fontSize: 15 }}>{titleLabel}</span>
          <span style={{
            background: status?.configured ? (status?.token_valid ? "rgba(76,255,139,0.15)" : "rgba(255,152,0,0.15)") : "rgba(255,76,76,0.15)",
            color: status?.configured ? (status?.token_valid ? "#4cff8b" : "#ff9800") : "#ff4c4c",
            padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
          }}>
            {status?.configured ? (status?.token_valid ? "● 연결됨" : "● 토큰 만료") : "● 미설정"}
          </span>
        </div>
        {status?.account_no && <span style={{ color: "#6688aa", fontSize: 12, fontFamily: "monospace" }}>계좌: {status.account_no}</span>}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", background: tab === t.id ? "rgba(26,58,110,0.6)" : "rgba(15,22,48,0.6)",
            color: tab === t.id ? "#64b5f6" : "#6688aa",
            border: tab === t.id ? "1px solid rgba(100,180,246,0.3)" : "1px solid rgba(100,140,200,0.1)",
            borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "config" && <ConfigPanel mode={mode} onConnect={async () => {
        await activateKisMode(mode);
        const creds = await loadKisCredentials(mode);
        setStatus({ configured: true, token_valid: !!creds.access_token, is_virtual: isVirtual, account_no: creds.account_no ? creds.account_no.replace(/-/g, "").slice(0, 4) + "****" + creds.account_no.replace(/-/g, "").slice(-2) : "" });
      }} />}
      {tab === "balance" && <BalancePanel key={mode} />}
      {tab === "autotrade" && <AutoTradePanel key={mode} mode={mode} />}
      {tab === "order" && <OrderPanel key={mode} />}
      {tab === "orders" && <OrderHistoryPanel key={mode} />}
      {tab === "quote" && <QuotePanel key={mode} />}
      {tab === "asking" && <AskingPanel key={mode} />}
      {tab === "finance" && <FinancePanel key={mode} />}
    </div>
  );
}

// ============================================================
// Config Panel
// ============================================================
function ConfigPanel({ mode = 'virtual', onConnect }) {
  const isV = mode === 'virtual';
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [acctNo, setAcctNo] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [result, setResult] = useState(null);
  const [connecting, setConnecting] = useState(false);

  // 비동기로 암호화된 크레덴셜 복호화 후 폼에 로드
  useEffect(() => {
    loadKisCredentials(mode).then(saved => {
      if (saved.app_key) setAppKey(saved.app_key);
      if (saved.app_secret) setAppSecret(saved.app_secret);
      if (saved.account_no) setAcctNo(saved.account_no);
      if (saved.access_token) setHasToken(true);
    });
  }, [mode]);

  const connect = async () => {
    if (!appKey || !appSecret || !acctNo) return;
    setConnecting(true);
    setResult(null);
    const r = await kisApi("config", {}, {
      method: "POST",
      body: JSON.stringify({ app_key: appKey, app_secret: appSecret, account_no: acctNo, is_virtual: isV }),
    });
    setResult(r);
    setConnecting(false);
    if (r?.success && r.access_token) {
      await saveKisCredentials({ app_key: appKey, app_secret: appSecret, account_no: acctNo, is_virtual: isV, access_token: r.access_token });
      setHasToken(true);
      onConnect?.();
    }
  };

  const borderColor = isV ? 'rgba(26,111,255,0.3)' : 'rgba(220,38,38,0.3)';
  const accentColor = isV ? '#60a5fa' : '#ef4444';

  return (
    <div style={S.panel}>
      <div style={S.title}>{isV ? '🏦 모의투자' : '🔴 실전투자'} API 설정</div>

      <div style={{ border: `1px solid ${borderColor}`, borderRadius:10, padding:16, background: hasToken ? `${accentColor}08` : 'transparent' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span style={{ fontSize:14, fontWeight:700, color: accentColor }}>
            {isV ? '🏦 모의투자' : '🔴 실전투자'} API
          </span>
          {hasToken && <span style={{ fontSize:11, padding:'3px 10px', borderRadius:6, background:`${accentColor}20`, color:accentColor, fontWeight:600 }}>연결됨</span>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <label style={S.label}>App Key</label>
            <input style={S.input} value={appKey} onChange={e => setAppKey(e.target.value)} placeholder="앱키" />
          </div>
          <div>
            <label style={S.label}>App Secret</label>
            <input style={S.input} type="password" value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="앱시크릿" />
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={S.label}>계좌번호 (8자리-2자리, 예: 44044840-01)</label>
          <input style={{ ...S.input, maxWidth:300 }} value={acctNo} onChange={e => setAcctNo(e.target.value)} placeholder="00000000-01" />
          {acctNo && acctNo.replace(/-/g, "").length < 10 && (
            <div style={{ color: "#ff9800", fontSize: 11, marginTop: 4 }}>
              ⚠️ 계좌번호는 10자리 (8자리+상품코드2자리)를 입력해주세요. 예: {acctNo.replace(/-/g, "")}-01
            </div>
          )}
        </div>
        <button onClick={connect} disabled={connecting || !appKey || !appSecret || !acctNo || acctNo.replace(/-/g, "").length < 10}
          style={{ ...S.btn(isV ? "#1a5a3e" : "#5a1a1a"), padding:"8px 20px", fontSize:12, opacity: connecting ? 0.6 : 1 }}>
          {connecting ? "연결 중..." : hasToken ? "재연결" : "연결하기"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop:12, padding:10, borderRadius:8, background: result.success ? 'rgba(76,255,139,0.08)' : 'rgba(255,76,76,0.08)', border: `1px solid ${result.success ? 'rgba(76,255,139,0.2)' : 'rgba(255,76,76,0.2)'}` }}>
          <span style={{ color: result.success ? "#4cff8b" : "#ff4c4c", fontSize:12 }}>
            {result.success ? `연결 성공! (${isV ? "모의투자" : "실전투자"})` : result.detail || "연결 실패"}
          </span>
        </div>
      )}

      <div style={{ marginTop:16, padding:12, background:"rgba(10,18,40,0.5)", borderRadius:8 }}>
        <div style={{ color:"#6688aa", fontSize:11, lineHeight:1.8 }}>
          한국투자증권 KIS Developers에서 앱키를 발급받으세요.<br />
          모의투자/실전투자 앱키는 별도로 발급받아야 합니다.<br />
          {isV ? '모의투자 계좌는 HTS에서 신청 가능합니다.' : '실전투자는 실제 매매가 이루어지므로 주의하세요.'}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Dashboard Panel (기존 BalancePanel → 대시보드 레이아웃으로 확장)
// ============================================================
function BalancePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [chartStock, setChartStock] = useState(null);
  const [quoteData, setQuoteData] = useState(null);
  // ★ 예비 후보 종목
  const [candidates, setCandidates] = useState([]);
  const [candLoading, setCandLoading] = useState(false);
  // ★ 보유종목 차트
  const [chartCandles, setChartCandles] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await kisApi("balance");
    setData(r);
    setLoading(false);
    // 보유종목 첫번째 종목 시세+차트 조회
    if (r?.success && r.positions?.length > 0) {
      const first = r.positions[0];
      setChartStock(first);
      setChartLoading(true);
      const [q, c] = await Promise.all([
        kisApi("quote", { code: first.stock_code }),
        kisApi("chart", { code: first.stock_code, period: "D" }),
      ]);
      if (q?.success) setQuoteData(q);
      if (c?.success) setChartCandles(c.candles);
      setChartLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    const r = await kisApi("orders");
    if (r?.success) setOrders(r.orders || []);
    setOrdersLoading(false);
  }, []);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    const r = await kisApi("pending");
    if (r?.success) setPendingOrders(r.pending || []);
    setPendingLoading(false);
  }, []);

  // ★ 예비 후보 종목 로드
  const loadCandidates = useCallback(async () => {
    setCandLoading(true);
    try {
      const { data: cands } = await supabase.from('buy_candidates')
        .select('*').eq('status', 'active')
        .order('composite_score', { ascending: false }).limit(20);
      setCandidates(cands || []);
    } catch (e) { console.error('후보 로드 실패:', e); }
    setCandLoading(false);
  }, []);

  // ★ 보유종목 차트 열기
  const openChart = async (p) => {
    setChartStock(p);
    setChartCandles(null);
    setChartLoading(true);
    const [c, q] = await Promise.all([
      kisApi("chart", { code: p.stock_code, period: "D" }),
      kisApi("quote", { code: p.stock_code }),
    ]);
    if (c?.success) setChartCandles(c.candles);
    if (q?.success) setQuoteData(q);
    setChartLoading(false);
  };

  const cancelOrder = async (order) => {
    if (!confirm(`${order.stock_name} ${order.side} 주문을 취소하시겠습니까?`)) return;
    const r = await kisApi("order/cancel", {}, {
      method: "POST",
      body: { org_order_no: order.order_no, qty: order.remain_qty, price: order.order_price }
    });
    if (r?.success) { loadPending(); loadOrders(); }
    else alert("주문 취소 실패: " + (r?.message || ""));
  };

  useEffect(() => { load(); loadOrders(); loadPending(); loadCandidates(); }, [load, loadOrders, loadPending, loadCandidates]);

  if (loading) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#6688aa" }}>대시보드 로딩 중...</div>;
  if (!data?.success) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#ff9800" }}>잔고 조회 실패 - KIS API 설정을 확인하세요</div>;

  const { positions, summary } = data;
  const GOAL = 10000000;
  const initCap = 3000000;
  const tgtPct = summary.total_eval ? (summary.total_eval / GOAL * 100) : 0;
  const remaining = Math.max(0, GOAL - (summary.total_eval || 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ★ 상단 4개 요약 카드 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          ["💰", "총 평가액", `${fmt(summary.total_eval)}원`, clr(summary.total_profit)],
          ["📊", "총 손익", fmtWon(summary.total_profit), clr(summary.total_profit)],
          ["💵", "예수금", `${fmt(summary.deposit)}원`, "#64b5f6"],
          ["📈", "수익률", fmtPct(summary.profit_rate), clr(summary.profit_rate)],
        ].map(([icon, title, value, color]) => (
          <div key={title} style={{ ...S.panel, flex: 1, minWidth: 180 }}>
            <div style={{ color: "#6688aa", fontSize: 12, marginBottom: 4 }}>{icon} {title}</div>
            <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ★ 중간행: 예비 후보 종목 + 보유종목 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* 예비 후보 종목 패널 */}
        <div style={{ ...S.panel, flex: "0 1 380px", minWidth: 300 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e0e6f0' }}>
              🎯 예비 후보 종목 <span style={{ color: "#6688aa", fontSize: 12, fontWeight: 400 }}>({candidates.length})</span>
            </div>
            <button onClick={loadCandidates} style={{ ...S.btn(), padding: "4px 10px", fontSize: 10 }}>새로고침</button>
          </div>
          {candLoading ? (
            <div style={{ textAlign: "center", padding: 30, color: "#6688aa", fontSize: 12 }}>후보 종목 로딩 중...</div>
          ) : candidates.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#556677", fontSize: 12 }}>
              패턴탐지기에서 후보를 등록하세요
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {/* 헤더 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 50px 50px 42px", padding: "6px 8px", fontSize: 10, color: "#6688aa", fontWeight: 600, borderBottom: "1px solid rgba(100,140,200,0.2)" }}>
                <span>종목</span><span style={{ textAlign: "right" }}>현재가</span><span style={{ textAlign: "center" }}>종합</span><span style={{ textAlign: "center" }}>진입</span><span style={{ textAlign: "center" }}>잔여</span>
              </div>
              {candidates.map((c, i) => {
                const daysLeft = c.expires_at ? Math.max(0, Math.ceil((new Date(c.expires_at) - new Date()) / 86400000)) : 0;
                const scoreColor = c.composite_score >= 80 ? "#ff4444" : c.composite_score >= 60 ? "#f59e0b" : "#6688aa";
                return (
                  <div key={c.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 70px 50px 50px 42px",
                    padding: "7px 8px", fontSize: 12, alignItems: "center",
                    borderBottom: i < candidates.length - 1 ? "1px solid rgba(100,140,200,0.08)" : "none",
                    background: daysLeft <= 1 ? "rgba(220,38,38,0.05)" : "transparent",
                  }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 600, color: "#e0e6f0" }}>{c.name}</span>
                      <span style={{ color: "#556677", marginLeft: 4, fontSize: 10 }}>{c.code}</span>
                    </div>
                    <div style={{ textAlign: "right", color: "#e0e6f0", fontFamily: "monospace", fontSize: 11 }}>{c.current_price?.toLocaleString() || "-"}</div>
                    <div style={{ textAlign: "center", color: scoreColor, fontWeight: 600 }}>{c.composite_score || "-"}</div>
                    <div style={{ textAlign: "center", color: "#6688aa" }}>{c.entry_score || "-"}</div>
                    <div style={{ textAlign: "center", color: daysLeft <= 1 ? "#ff4444" : "#6688aa", fontSize: 11 }}>D-{daysLeft}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 보유종목 테이블 */}
        <div style={{ ...S.panel, flex: "1 1 600px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={S.title}>💼 보유종목 ({positions.length})</div>
            <button onClick={load} style={{ ...S.btn(), padding: "6px 12px", fontSize: 11 }}>새로고침</button>
          </div>
          {positions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>보유 종목 없음</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["종목", "수량", "평균가", "현재가", "손익", "수익률", "보유금액"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {positions.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(100,140,200,0.08)", cursor: "pointer", background: chartStock?.stock_code === p.stock_code ? "rgba(79,195,247,0.08)" : "transparent" }}
                    onClick={() => openChart(p)}>
                    <td style={{ ...S.td, color: chartStock?.stock_code === p.stock_code ? "#4fc3f7" : "#e0e6f0", fontWeight: 600, textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3 }}>{p.stock_name}({p.stock_code})</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(p.qty)}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(Math.round(p.avg_price))}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(p.current_price)}</td>
                    <td style={{ ...S.td, color: clr(p.profit_loss), fontFamily: "monospace", fontWeight: 600 }}>{fmtWon(p.profit_loss)}</td>
                    <td style={{ ...S.td, color: clr(p.profit_rate), fontFamily: "monospace", fontWeight: 600 }}>{fmtPct(p.profit_rate)}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace", fontWeight: 600 }}>{fmt(p.eval_amount || (p.current_price * p.qty))}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ★ 하단행: 종목 차트 + 목표 여정 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* 보유종목 차트 */}
        <div style={{ ...S.panel, flex: "1 1 500px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={S.title}>
              📊 {chartStock ? `${chartStock.stock_name} 차트` : "종목 차트"}
            </div>
            {chartStock && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {positions.length > 1 && positions.map((p, i) => (
                  <button key={i} onClick={() => openChart(p)} style={{
                    background: chartStock?.stock_code === p.stock_code ? "rgba(79,195,247,0.2)" : "transparent",
                    color: chartStock?.stock_code === p.stock_code ? "#4fc3f7" : "#556677",
                    border: `1px solid ${chartStock?.stock_code === p.stock_code ? "rgba(79,195,247,0.3)" : "rgba(100,140,200,0.15)"}`,
                    borderRadius: 6, padding: "3px 8px", fontSize: 10, cursor: "pointer",
                  }}>{p.stock_name}</button>
                ))}
              </div>
            )}
          </div>
          {!chartStock ? (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,15,30,0.6)", borderRadius: 8 }}>
              <span style={{ color: "#556677", fontSize: 13 }}>보유종목을 클릭하면 차트가 표시됩니다</span>
            </div>
          ) : chartLoading ? (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,15,30,0.6)", borderRadius: 8 }}>
              <span style={{ color: "#6688aa", fontSize: 13 }}>📊 차트 로딩 중...</span>
            </div>
          ) : (
            <>
              {chartCandles && chartCandles.length > 0 ? (
                <StockChart candles={chartCandles.slice(0, 100)} buyPrice={chartStock?.avg_price} />
              ) : (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,15,30,0.6)", borderRadius: 8 }}>
                  <span style={{ color: "#556677", fontSize: 12 }}>차트 데이터를 불러올 수 없습니다</span>
                </div>
              )}
              {/* 시세 요약 */}
              {quoteData && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 8, background: "rgba(8,15,30,0.6)", borderRadius: 8, padding: 10 }}>
                  {[
                    ["현재가", fmt(quoteData.price), clr(quoteData.change)],
                    ["전일대비", `${quoteData.change >= 0 ? "+" : ""}${fmt(quoteData.change)}`, clr(quoteData.change)],
                    ["등락률", `${quoteData.change_rate >= 0 ? "+" : ""}${quoteData.change_rate}%`, clr(quoteData.change_rate)],
                    ["시가", fmt(quoteData.open), "#e0e6f0"],
                    ["고가", fmt(quoteData.high), "#ff4444"],
                    ["저가", fmt(quoteData.low), "#4488ff"],
                  ].map(([label, val, color]) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ color: "#556677", fontSize: 9 }}>{label}</div>
                      <div style={{ color, fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 300만원 → 1천만원 여정 */}
        <div style={{ ...S.panel, flex: "1 1 400px" }}>
          <div style={S.title}>🎯 300만원 → 1천만원 여정</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
            {[
              ["시작금액", `${fmt(initCap)}원`, "#e0e6f0"],
              ["현재자산", `${fmt(summary.total_eval)}원`, "#4cff8b"],
              ["남은금액", `${fmt(remaining)}원`, "#ffd54f"],
            ].map(([l, v, c]) => (
              <div key={l} style={{ flex: 1 }}>
                <div style={{ color: "#556677", fontSize: 11 }}>{l}</div>
                <div style={{ color: c, fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span style={{ color: "#556677" }}>목표 진행률</span>
              <span style={{ color: "#64b5f6" }}>{tgtPct.toFixed(2)}%</span>
            </div>
            <div style={{ background: "rgba(10,18,40,0.8)", borderRadius: 6, height: 8, marginTop: 4, overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(90deg,#4fc3f7,#4cff8b)", width: `${Math.min(Math.max(tgtPct, 0.1), 100)}%`, minWidth: 4, height: "100%", borderRadius: 6 }} />
            </div>
          </div>
          {tgtPct >= 100 && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(76,255,139,0.1)", border: "1px solid rgba(76,255,139,0.2)", textAlign: "center" }}>
              <span style={{ color: "#4cff8b", fontSize: 14, fontWeight: 700 }}>🎉 목표 달성!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Order Panel
// ============================================================
function OrderPanel() {
  const [stockCode, setStockCode] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [orderType, setOrderType] = useState("00");
  const [side, setSide] = useState("buy");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [quoteData, setQuoteData] = useState(null);

  const fetchQuote = async () => {
    if (stockCode.length < 6) return;
    const r = await kisApi("quote", { code: stockCode });
    if (r?.success) {
      setQuoteData(r);
      if (!price) setPrice(String(r.price));
    }
  };

  const fetchBuyable = async () => {
    if (!stockCode || !price) return;
    const r = await kisApi("buyable", { stock_code: stockCode, price });
    if (r?.success) setResult({ type: "info", message: `매수 가능: 최대 ${fmt(r.max_qty)}주 (예수금: ${fmt(r.deposit)}원)` });
  };

  const submitOrder = async () => {
    if (!stockCode || !qty) return;
    setSubmitting(true);
    setResult(null);

    const orderRoute = side === "buy" ? "order/buy" : "order/sell";
    const r = await kisApi(orderRoute, {}, {
      method: "POST",
      body: JSON.stringify({
        stock_code: stockCode,
        qty: parseInt(qty),
        price: orderType === "00" ? parseInt(price || "0") : 0,
        order_type: orderType,
      }),
    });

    if (r?.success) {
      setResult({ type: "success", message: `${side === "buy" ? "매수" : "매도"} 주문 성공! 주문번호: ${r.order_no}` });

      // ── 매매 일지 자동 기록 ──
      try {
        const activeMode = getKisActiveMode();
        const journalMode = activeMode === 'real' ? 'real' : 'mock';
        const orderPrice = parseInt(price || "0");
        const orderQty = parseInt(qty);
        const stockName = quoteData?.name || stockCode;

        // 매도 시: 잔고 API에서 평균매수단가 조회 → 실현손익 계산
        let realizedPnl = 0;
        let realizedPnlPct = 0;
        let cashBalance = 0;

        if (side === 'sell') {
          const bal = await kisApi("balance");
          if (bal?.success) {
            cashBalance = bal.summary?.deposit || 0;
            const pos = bal.positions?.find(p => p.stock_code === stockCode);
            if (pos && pos.avg_price > 0) {
              realizedPnl = Math.round((orderPrice - pos.avg_price) * orderQty);
              realizedPnlPct = Math.round((orderPrice - pos.avg_price) / pos.avg_price * 10000) / 100;
            }
          }
        } else {
          // 매수 시: 예수금만 조회
          const bal = await kisApi("balance");
          if (bal?.success) cashBalance = bal.summary?.deposit || 0;
        }

        await supabase.from('trade_journal').insert({
          mode: journalMode,
          trade_type: side,
          stock_code: stockCode,
          stock_name: stockName,
          price: orderPrice,
          quantity: orderQty,
          amount: orderPrice * orderQty,
          realized_pnl: realizedPnl,
          realized_pnl_pct: realizedPnlPct,
          cash_balance: cashBalance,
          order_no: r.order_no || '',
          memo: '자동 기록',
          trade_date: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[매매일지] 자동 기록 실패:', e.message);
      }
    } else {
      setResult({ type: "error", message: r?.message || r?.detail || "주문 실패" });
    }
    setSubmitting(false);
  };

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {/* Order Form */}
      <div style={{ ...S.panel, flex: "1 1 400px" }}>
        <div style={S.title}>주문하기</div>

        {/* Buy/Sell Toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => setSide("buy")} style={{
            flex: 1, padding: "12px", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
            background: side === "buy" ? "rgba(255,68,68,0.2)" : "rgba(30,40,60,0.5)",
            color: side === "buy" ? "#ff4444" : "#6688aa",
            borderBottom: side === "buy" ? "3px solid #ff4444" : "3px solid transparent",
          }}>매수</button>
          <button onClick={() => setSide("sell")} style={{
            flex: 1, padding: "12px", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
            background: side === "sell" ? "rgba(68,136,255,0.2)" : "rgba(30,40,60,0.5)",
            color: side === "sell" ? "#4488ff" : "#6688aa",
            borderBottom: side === "sell" ? "3px solid #4488ff" : "3px solid transparent",
          }}>매도</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={S.label}>종목코드</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...S.input, flex: 1 }} value={stockCode} onChange={e => setStockCode(e.target.value)} placeholder="005930" />
              <button onClick={fetchQuote} style={{ ...S.btn(), padding: "8px 14px", fontSize: 11 }}>조회</button>
            </div>
          </div>

          {quoteData && (
            <div style={{ padding: 10, background: "rgba(10,18,40,0.5)", borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: "#e0e6f0", fontWeight: 600 }}>{quoteData.name}</span>
              <span style={{ color: clr(quoteData.change), marginLeft: 12, fontFamily: "monospace" }}>
                {fmt(quoteData.price)}원 ({fmtPct(quoteData.change_rate)})
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>주문유형</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setOrderType("00")} style={{ ...S.btn(orderType === "00" ? "#1a3a6e" : "#222"), padding: "8px 12px", fontSize: 11 }}>
                  {orderType === "00" ? "✓ " : ""}지정가
                </button>
                <button onClick={() => setOrderType("01")} style={{ ...S.btn(orderType === "01" ? "#1a3a6e" : "#222"), padding: "8px 12px", fontSize: 11 }}>
                  {orderType === "01" ? "✓ " : ""}시장가
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>수량</label>
              <input style={S.input} type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
            </div>
            {orderType === "00" && (
              <div style={{ flex: 1 }}>
                <label style={S.label}>가격</label>
                <input style={S.input} type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
              </div>
            )}
          </div>

          {side === "buy" && (
            <button onClick={fetchBuyable} style={{ ...S.btn("#333", "#444"), padding: "8px 14px", fontSize: 11 }}>
              매수 가능 수량 조회
            </button>
          )}

          {/* Order Summary */}
          {qty && price && orderType === "00" && (
            <div style={{ padding: 10, background: "rgba(10,18,40,0.5)", borderRadius: 8 }}>
              <div style={{ color: "#6688aa", fontSize: 11 }}>주문 예상 금액</div>
              <div style={{ color: "#e0e6f0", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>
                {fmt(parseInt(qty || 0) * parseInt(price || 0))}원
              </div>
            </div>
          )}

          <button onClick={submitOrder} disabled={submitting || !stockCode || !qty}
            style={{
              ...S.btn(side === "buy" ? "#8b0000" : "#00008b", side === "buy" ? "#cc0000" : "#0044cc"),
              padding: "14px", fontSize: 15, opacity: submitting ? 0.6 : 1,
            }}>
            {submitting ? "주문 처리 중..." : `${side === "buy" ? "매수" : "매도"} 주문`}
          </button>

          {result && (
            <div style={{
              padding: 12, borderRadius: 8, fontSize: 12,
              background: result.type === "success" ? "rgba(76,255,139,0.1)" : result.type === "error" ? "rgba(255,76,76,0.1)" : "rgba(100,181,246,0.1)",
              color: result.type === "success" ? "#4cff8b" : result.type === "error" ? "#ff4c4c" : "#64b5f6",
              border: `1px solid ${result.type === "success" ? "rgba(76,255,139,0.3)" : result.type === "error" ? "rgba(255,76,76,0.3)" : "rgba(100,181,246,0.3)"}`,
            }}>
              {result.message}
            </div>
          )}
        </div>
      </div>

      {/* Quick Quote */}
      {quoteData && (
        <div style={{ ...S.panel, flex: "1 1 300px" }}>
          <div style={S.title}>{quoteData.name} 상세</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              ["현재가", `${fmt(quoteData.price)}원`, clr(quoteData.change)],
              ["전일대비", `${fmtWon(quoteData.change)} (${fmtPct(quoteData.change_rate)})`, clr(quoteData.change)],
              ["시가", `${fmt(quoteData.open)}원`, "#e0e6f0"],
              ["고가", `${fmt(quoteData.high)}원`, "#ff4444"],
              ["저가", `${fmt(quoteData.low)}원`, "#4488ff"],
              ["거래량", `${fmt(quoteData.volume)}주`, "#e0e6f0"],
              ["PER", quoteData.per?.toFixed(2) || "—", "#ffd54f"],
              ["PBR", quoteData.pbr?.toFixed(2) || "—", "#ffd54f"],
              ["시가총액", `${fmt(quoteData.market_cap)}억`, "#64b5f6"],
              ["52주 고가", `${fmt(quoteData["52w_high"])}원`, "#ff4444"],
              ["52주 저가", `${fmt(quoteData["52w_low"])}원`, "#4488ff"],
              ["EPS", fmt(Math.round(quoteData.eps || 0)), "#e0e6f0"],
            ].map(([label, value, color]) => (
              <div key={label} style={{ padding: "6px 0" }}>
                <div style={{ color: "#556677", fontSize: 10 }}>{label}</div>
                <div style={{ color, fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Order History Panel
// ============================================================
function OrderHistoryPanel() {
  const [orders, setOrders] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const loadAll = async () => {
    setLoading(true);
    const [ordR, penR] = await Promise.all([kisApi("orders"), kisApi("pending")]);
    if (ordR?.success) setOrders(ordR.orders || []);
    if (penR?.success) setPending(penR.pending || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const cancelOrder = async (order) => {
    if (!confirm(`${order.stock_name} ${order.side} 주문을 취소하시겠습니까?`)) return;
    const r = await kisApi("order/cancel", {}, {
      method: "POST",
      body: { org_order_no: order.order_no, qty: order.remain_qty, price: order.order_price }
    });
    if (r?.success) loadAll();
    else alert("주문 취소 실패: " + (r?.message || ""));
  };

  if (loading) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#6688aa" }}>주문내역 조회 중...</div>;

  const filters = [
    { id: "all", label: `전체 (${orders.length + pending.length})` },
    { id: "executed", label: `체결 (${orders.filter(o => o.exec_qty > 0).length})` },
    { id: "pending", label: `미체결 (${pending.length})` },
  ];

  return (
    <div style={S.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.title}>오늘의 주문내역</div>
          <div style={{ display: "flex", gap: 4 }}>
            {filters.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: "4px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                background: filter === f.id ? "rgba(100,180,246,0.15)" : "transparent",
                color: filter === f.id ? "#64b5f6" : "#6688aa",
                border: filter === f.id ? "1px solid rgba(100,180,246,0.3)" : "1px solid rgba(100,140,200,0.1)",
              }}>{f.label}</button>
            ))}
          </div>
        </div>
        <button onClick={loadAll} style={{ ...S.btn(), padding: "6px 14px", fontSize: 11 }}>새로고침</button>
      </div>

      {/* 미체결 배너 */}
      {pending.length > 0 && filter !== "executed" && (
        <div style={{ background: "rgba(255,152,0,0.1)", border: "1px solid rgba(255,152,0,0.25)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span style={{ color: "#ff9800", fontSize: 12, fontWeight: 600 }}>미체결 대기 {pending.length}건</span>
          <span style={{ color: "#6688aa", fontSize: 11 }}>| 장 시작 시 체결 예정</span>
        </div>
      )}

      {/* 미체결 테이블 */}
      {filter !== "executed" && pending.length > 0 && (
        <div style={{ marginBottom: filter === "pending" ? 0 : 16 }}>
          {filter === "all" && <div style={{ color: "#ff9800", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>⏳ 미체결 주문</div>}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["주문번호", "시간", "구분", "종목", "주문가", "잔여수량", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {pending.map((o, i) => (
                <tr key={i} style={{ background: "rgba(255,152,0,0.05)", borderBottom: "1px solid rgba(100,140,200,0.08)" }}>
                  <td style={{ ...S.td, color: "#ff9800", fontFamily: "monospace" }}>{o.order_no}</td>
                  <td style={{ ...S.td, color: "#ff9800", fontFamily: "monospace" }}>{o.order_time?.slice(0, 4) ? `${o.order_time.slice(0, 2)}:${o.order_time.slice(2, 4)}` : o.order_time || "--:--"}</td>
                  <td style={{ ...S.td, color: o.side === "매수" ? "#ff4444" : "#4488ff", fontWeight: 600 }}>{o.side}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontWeight: 600 }}>{o.stock_name}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.order_price)}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.remain_qty)}</td>
                  <td style={S.td}><button onClick={() => cancelOrder(o)} style={{ background: "rgba(255,76,76,0.15)", color: "#ff4c4c", border: "1px solid rgba(255,76,76,0.3)", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>취소</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 체결 테이블 */}
      {filter !== "pending" && (
        <>
          {filter === "all" && orders.length > 0 && <div style={{ color: "#4cff8b", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>체결 주문</div>}
          {orders.length === 0 ? (
            filter === "executed" && <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>체결내역 없음</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["주문번호", "시간", "구분", "종목", "주문가", "주문수량", "체결가", "체결수량", "상태"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "rgba(10,18,40,0.3)" : "transparent" }}>
                    <td style={{ ...S.td, color: "#6688aa", fontFamily: "monospace" }}>{o.order_no}</td>
                    <td style={{ ...S.td, color: "#6688aa", fontFamily: "monospace" }}>{o.order_time?.slice(0, 4) ? `${o.order_time.slice(0, 2)}:${o.order_time.slice(2, 4)}` : o.order_time}</td>
                    <td style={{ ...S.td, color: o.side === "매수" ? "#ff4444" : "#4488ff", fontWeight: 600 }}>{o.side}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontWeight: 600 }}>{o.stock_name}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.order_price)}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.order_qty)}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.exec_price)}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.exec_qty)}</td>
                    <td style={{ ...S.td, color: o.exec_qty > 0 ? "#4cff8b" : "#ff9800" }}>{o.exec_qty > 0 ? "체결" : "미체결"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {(orders.length === 0 && pending.length === 0) && (
        <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>주문내역 없음</div>
      )}
    </div>
  );
}

// ============================================================
// Quote Panel
// ============================================================
function StockSearchInput({ value, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSugg(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const searchByKeyword = async (keyword) => {
    try {
      const url = new URL("/api/kis", window.location.origin);
      url.searchParams.set("_route", "search");
      url.searchParams.set("keyword", keyword);
      const r = await fetch(url).then(r => r.json());
      return r.results || [];
    } catch { return []; }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(timerRef.current);
    if (v.trim() && !/^\d{1,6}$/.test(v.trim())) {
      // 즉시 로컬 매핑에서 검색
      const local = localStockSearch(v.trim());
      if (local.length) { setSuggestions(local); setShowSugg(true); }
      else {
        // 로컬에 없으면 서버 검색
        timerRef.current = setTimeout(async () => {
          const results = await searchByKeyword(v.trim());
          if (results.length) { setSuggestions(results); setShowSugg(true); }
          else setShowSugg(false);
        }, 300);
      }
    } else {
      setShowSugg(false);
    }
  };

  const handleEnter = async () => {
    setShowSugg(false);
    const v = (value || "").trim();
    if (!v) return;
    // 숫자(종목코드)면 바로 조회
    if (/^\d{1,6}$/.test(v)) { onSelect(v); return; }
    // 드롭다운에 결과가 있으면 첫 번째 항목 사용
    if (suggestions.length > 0) {
      onChange(suggestions[0].code);
      onSelect(suggestions[0].code);
      return;
    }
    // 없으면 검색 후 첫 번째 결과 사용
    const results = await searchByKeyword(v);
    if (results.length > 0) {
      onChange(results[0].code);
      onSelect(results[0].code);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1, maxWidth: 260 }}>
      <input style={{ ...S.input, width: "100%" }} value={value} onChange={handleChange}
        onKeyDown={e => { if (e.key === "Enter") handleEnter(); }}
        placeholder={placeholder || "종목코드 또는 종목명"} />
      {showSugg && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "#1a2332", border: "1px solid rgba(100,140,200,0.2)", borderRadius: 6, maxHeight: 200, overflowY: "auto", marginTop: 2 }}>
          {suggestions.map((s, i) => (
            <div key={i} onClick={() => { onChange(s.code); onSelect(s.code); setShowSugg(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid rgba(100,140,200,0.1)", fontSize: 12, display: "flex", justifyContent: "space-between" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(100,181,246,0.1)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ color: "#e0e6f0" }}>{s.name}</span>
              <span style={{ color: "#6688aa", fontFamily: "monospace" }}>{s.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuotePanel() {
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [period, setPeriod] = useState("D");
  const [loading, setLoading] = useState(false);

  const search = async (overrideCode) => {
    const raw = (overrideCode || code || "").trim();
    if (!raw) return;
    setLoading(true);
    const stockCode = await resolveStockCode(raw);
    if (stockCode !== raw) setCode(stockCode);
    const [q, c] = await Promise.all([
      kisApi("quote", { code: stockCode }),
      kisApi("chart", { code: stockCode, period }),
    ]);
    if (q?.success) {
      if (c?.success && c.info) {
        const chartName = c.info.hts_kor_isnm || c.info.stck_shrn_iscd || "";
        if (chartName) q.name = chartName;
      }
      setQuote(q);
    }
    if (c?.success) setChartData(c.candles);
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Search */}
      <div style={{ ...S.panel, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StockSearchInput value={code} onChange={setCode} onSelect={(c) => search(c)} placeholder="종목코드 또는 종목명 (예: 삼성전자)" />
          {["D", "W", "M"].map(p => (
            <button key={p} onClick={() => { setPeriod(p); if (code) setTimeout(() => search(), 0); }}
              style={{ padding: "8px 12px", background: period === p ? "rgba(100,181,246,0.2)" : "transparent", color: period === p ? "#64b5f6" : "#6688aa", border: period === p ? "1px solid rgba(100,181,246,0.3)" : "1px solid transparent", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
              {{ D: "일봉", W: "주봉", M: "월봉" }[p]}
            </button>
          ))}
          <button onClick={() => search()} disabled={loading} style={{ ...S.btn(), padding: "8px 16px", fontSize: 12 }}>
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>
      </div>

      {quote && (
        <div style={{ ...S.panel, padding: "14px 16px" }}>
          {/* 종목 정보 헤더 */}
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: "#e0e6f0" }}>{quote.name}</span>
                <span style={{ fontSize: 11, color: "#6688aa" }}>{quote.stock_code}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: clr(quote.change), fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.2 }}>
                {fmt(quote.price)}<span style={{ fontSize: 13, color: "#6688aa" }}>원</span>
              </div>
              <div style={{ color: clr(quote.change), fontSize: 13, fontFamily: "monospace", marginTop: 2 }}>
                {quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : "—"} {fmt(Math.abs(quote.change))}원 ({fmtPct(quote.change_rate)})
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignSelf: "center" }}>
              {[["시가", quote.open], ["고가", quote.high], ["저가", quote.low], ["거래량", quote.volume], ["PER", quote.per?.toFixed(1)], ["PBR", quote.pbr?.toFixed(2)]].map(([l, v]) => (
                <div key={l}><div style={{ color: "#556677", fontSize: 9 }}>{l}</div><div style={{ color: "#e0e6f0", fontSize: 12, fontFamily: "monospace" }}>{typeof v === "number" ? fmt(v) : v || "—"}</div></div>
              ))}
            </div>
          </div>

          {/* 차트 - 전체 너비 */}
          {chartData && chartData.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "#6688aa", marginBottom: 6 }}>
                {{ D: "일봉", W: "주봉", M: "월봉" }[period]} ({chartData.length}개)
              </div>
              <StockChart candles={chartData.slice(0, 100)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Asking Price Panel (호가)
// ============================================================
function AskingPanel() {
  const [code, setCode] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const search = async (overrideCode) => {
    const raw = (overrideCode || code || "").trim();
    if (!raw) return;
    setLoading(true);
    const stockCode = await resolveStockCode(raw);
    if (stockCode !== raw) setCode(stockCode);
    const r = await kisApi("asking", { code: stockCode });
    if (r?.success) setData(r);
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.panel, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <StockSearchInput value={code} onChange={setCode} onSelect={(c) => search(c)} placeholder="종목코드 또는 종목명" />
          <button onClick={() => search()} disabled={loading} style={{ ...S.btn(), padding: "8px 16px", fontSize: 12 }}>
            {loading ? "조회 중..." : "호가 조회"}
          </button>
        </div>
      </div>

      {data && (
        <div style={S.panel}>
          <div style={S.title}>호가 (매도/매수)</div>
          <div style={{ display: "flex", gap: 16 }}>
            {/* Asks (매도) - reversed to show highest at top */}
            <div style={{ flex: 1 }}>
              <div style={{ color: "#4488ff", fontSize: 12, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>매도호가</div>
              {[...data.asks].reverse().map((a, i) => a.price > 0 && (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: `rgba(68,136,255,${0.05 + (a.qty / (data.total_ask_qty || 1)) * 0.3})`, borderRadius: 4, marginBottom: 2 }}>
                  <span style={{ color: "#4488ff", fontFamily: "monospace", fontSize: 12 }}>{fmt(a.price)}</span>
                  <span style={{ color: "#6688aa", fontFamily: "monospace", fontSize: 12 }}>{fmt(a.qty)}</span>
                </div>
              ))}
            </div>
            {/* Bids (매수) */}
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ff4444", fontSize: 12, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>매수호가</div>
              {data.bids.map((b, i) => b.price > 0 && (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: `rgba(255,68,68,${0.05 + (b.qty / (data.total_bid_qty || 1)) * 0.3})`, borderRadius: 4, marginBottom: 2 }}>
                  <span style={{ color: "#ff4444", fontFamily: "monospace", fontSize: 12 }}>{fmt(b.price)}</span>
                  <span style={{ color: "#6688aa", fontFamily: "monospace", fontSize: 12 }}>{fmt(b.qty)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 12, borderTop: "1px solid rgba(100,140,200,0.1)", paddingTop: 8 }}>
            <span style={{ color: "#4488ff", fontSize: 12 }}>총 매도잔량: {fmt(data.total_ask_qty)}</span>
            <span style={{ color: "#ff4444", fontSize: 12 }}>총 매수잔량: {fmt(data.total_bid_qty)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Finance Panel
// ============================================================
function FinancePanel() {
  const [code, setCode] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState(null);

  const search = async (overrideCode) => {
    const raw = (overrideCode || code || "").trim();
    if (!raw) return;
    setLoading(true);
    setError(null);
    setData(null);
    const stockCode = await resolveStockCode(raw);
    if (stockCode !== raw) setCode(stockCode);
    const r = await kisApi("finance", { code: stockCode });
    console.log("[KIS] finance response:", JSON.stringify(r));
    if (r?.success) {
      setData(r);
      if (!r.financial_ratio?.length && !r.income_statement?.length && !r.growth_ratio?.length) {
        setError("재무정보 데이터가 비어 있습니다." + (r.debug ? ` (ratio: ${r.debug.ratio_msg}, income: ${r.debug.income_msg})` : ""));
      }
    } else {
      setError(r?.detail || "재무정보 조회 실패");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.panel, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <StockSearchInput value={code} onChange={setCode} onSelect={(c) => search(c)} placeholder="종목코드 또는 종목명" />
          <button onClick={() => search()} disabled={loading} style={{ ...S.btn(), padding: "8px 16px", fontSize: 12 }}>
            {loading ? "조회 중..." : "재무정보 조회"}
          </button>
        </div>
        {error && <div style={{ marginTop: 8, padding: 10, background: "rgba(255,76,76,0.1)", border: "1px solid rgba(255,76,76,0.3)", borderRadius: 8, color: "#ff4c4c", fontSize: 12 }}>{error}</div>}
      </div>

      {data && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {/* Financial Ratio */}
          {data.financial_ratio?.length > 0 && (
            <div style={{ ...S.panel, flex: "1 1 400px" }}>
              <div style={S.title}>재무비율</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{Object.keys(data.financial_ratio[0] || {}).slice(0, 8).map(k => <th key={k} style={{ ...S.th, fontSize: 10 }}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {data.financial_ratio.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).slice(0, 8).map((v, j) => <td key={j} style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{v || "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Income Statement */}
          {data.income_statement?.length > 0 && (
            <div style={{ ...S.panel, flex: "1 1 400px" }}>
              <div style={S.title}>손익계산서</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{Object.keys(data.income_statement[0] || {}).slice(0, 8).map(k => <th key={k} style={{ ...S.th, fontSize: 10 }}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {data.income_statement.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).slice(0, 8).map((v, j) => <td key={j} style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{v || "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Growth Ratio */}
          {data.growth_ratio?.length > 0 && (
            <div style={{ ...S.panel, flex: "1 1 400px" }}>
              <div style={S.title}>성장성비율</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{Object.keys(data.growth_ratio[0] || {}).slice(0, 8).map(k => <th key={k} style={{ ...S.th, fontSize: 10 }}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {data.growth_ratio.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).slice(0, 8).map((v, j) => <td key={j} style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{v || "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Mini Candle Chart (for KIS chart data)
// ============================================================
// ============================================================
// 기본차트 (가상투자추적 StockCandleChart 스타일 완전 적용)
// 캔들+MA5/MA20+거래량+현재가태그+매수매도마커+DTW구간+호버
// ============================================================
function StockChart({ candles, buyDate, buyPrice, sellDate, sellPrice, pos }) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(780);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  if (!candles || candles.length < 5) return null;

  // ── 날짜 유틸 ──
  const norm = (d) => d ? d.replace(/-/g, '').trim() : '';
  const fDateS = (d) => { const s = norm(d); return s.length >= 8 ? `${s.slice(4,6)}/${s.slice(6,8)}` : d || '-'; };

  // ── 데이터 준비 (최대 100일) ──
  const MAX_CANDLES = 100;
  const rawCandles = candles.slice().reverse();
  const raw = rawCandles.length > MAX_CANDLES ? rawCandles.slice(rawCandles.length - MAX_CANDLES) : [...rawCandles];
  const offsetIdx = rawCandles.length > MAX_CANDLES ? rawCandles.length - MAX_CANDLES : 0;

  // ★ OHLC 보정
  const vis = raw.map(c => {
    const cl = c.close || 0;
    if (cl <= 0) return c;
    return { ...c, open: c.open > 0 ? c.open : cl, high: c.high > 0 ? Math.max(c.high, cl) : cl, low: c.low > 0 ? Math.min(c.low, cl) : cl, volume: c.volume || 0 };
  });

  // ── 매수/매도 인덱스 찾기 ──
  const buyDateN = norm(buyDate);
  const sellDateN = norm(sellDate);
  let buyIdx = -1, sellIdx = -1;
  if (buyDateN) {
    let gi = rawCandles.findIndex(c => norm(c.date) === buyDateN);
    if (gi < 0) gi = rawCandles.findIndex(c => norm(c.date) >= buyDateN);
    if (gi >= offsetIdx) buyIdx = gi - offsetIdx;
  }
  if (sellDateN) {
    let gi = rawCandles.findIndex(c => norm(c.date) === sellDateN);
    if (gi < 0) gi = rawCandles.findIndex(c => norm(c.date) >= sellDateN);
    if (gi >= offsetIdx) sellIdx = gi - offsetIdx;
  }
  if (buyIdx < 0 && buyPrice > 0) {
    const searchFrom = Math.floor(vis.length * 0.3);
    let minDiff = Infinity;
    for (let i = searchFrom; i < vis.length; i++) {
      const diff = Math.abs(vis[i].close - buyPrice);
      if (diff < minDiff) { minDiff = diff; buyIdx = i; }
    }
  }

  // ── 차트 사이즈 ──
  const W = containerWidth;
  const H_CHART = 280, H_VOL = 55, GAP = 20;
  const PAD = { t: 28, b: 40, l: 62, r: 80 };
  const TOTAL_H = PAD.t + H_CHART + GAP + H_VOL + PAD.b;
  const plotW = W - PAD.l - PAD.r;
  const cw = plotW / vis.length;

  // ── 가격 범위 (8% 패딩) ──
  const allP = vis.flatMap(c => [c.high, c.low]).filter(p => p > 0);
  const pMin0 = Math.min(...allP), pMax0 = Math.max(...allP);
  const pPad = (pMax0 - pMin0) * 0.08 || 100;
  const pLow = pMin0 - pPad, pHigh = pMax0 + pPad, pRange = pHigh - pLow || 1;
  const maxVol = Math.max(...vis.map(c => c.volume || 0), 1);

  const toX = (i) => PAD.l + i * cw;
  const toY = (p) => PAD.t + (1 - (p - pLow) / pRange) * H_CHART;
  const volBase = PAD.t + H_CHART + GAP + H_VOL;

  // ── 이동평균선 계산 ──
  const calcMA = (period) => vis.map((_, i) => {
    const gi = offsetIdx + i;
    if (gi < period - 1) return null;
    let sum = 0;
    for (let j = 0; j < period; j++) sum += rawCandles[gi - j].close;
    return sum / period;
  });
  const ma5 = calcMA(5);
  const ma20 = calcMA(20);

  // ── 호버 ──
  const hd = hoverIdx !== null ? vis[hoverIdx] : null;
  const handleMouseMove = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left - PAD.l;
    const idx = Math.floor(mx / cw);
    setHoverIdx(idx >= 0 && idx < vis.length ? idx : null);
  };

  // ── 현재가 ──
  const lastCandle = vis[vis.length - 1];
  const curPrice = lastCandle.close;
  const prevClose = vis.length > 1 ? vis[vis.length - 2].close : curPrice;
  const curColor = curPrice >= prevClose ? '#FF0000' : '#0050FF';

  // ── 매수/매도 상태 ──
  const hasBuy = buyIdx >= 0 && buyPrice > 0;
  const hasSell = sellIdx >= 0 && sellPrice > 0;
  const profitPct = hasBuy && (hasSell || curPrice > 0) ? (((hasSell ? sellPrice : curPrice) - buyPrice) / buyPrice * 100) : 0;
  const profitColor = profitPct >= 0 ? '#FF0000' : '#0050FF';
  const statusLabel = pos?.status === 'profit' ? '익절' : pos?.status === 'trailing' ? '추적' : pos?.status === 'loss' ? '손절' : pos?.status === 'timeout' ? '만기' : '';

  const svg = [];

  // ── 배경 ──
  svg.push(<rect key="bg" x={0} y={0} width={W} height={TOTAL_H} fill="rgba(8,15,30,0.95)" rx={8} />);

  // ── DTW 패턴 감지 구간 (매수 30일 전 ~ 매수일) ──
  if (buyIdx >= 0) {
    const dtwStart = Math.max(0, buyIdx - 30);
    const dx1 = toX(dtwStart), dx2 = toX(buyIdx) + cw;
    svg.push(<rect key="dtw-bg" x={dx1} y={PAD.t} width={dx2 - dx1} height={H_CHART} fill="rgba(206,147,216,0.04)" />);
    svg.push(<line key="dtw-vl" x1={dx1} y1={PAD.t} x2={dx1} y2={PAD.t + H_CHART} stroke="rgba(0,230,118,0.3)" strokeWidth={1} strokeDasharray="5,4" />);
    svg.push(<line key="dtw-vr" x1={dx2} y1={PAD.t} x2={dx2} y2={PAD.t + H_CHART} stroke="rgba(0,230,118,0.3)" strokeWidth={1} strokeDasharray="5,4" />);
    svg.push(<rect key="dtw-bar" x={dx1} y={PAD.t + H_CHART - 6} width={dx2 - dx1} height={6} fill="rgba(206,147,216,0.45)" rx={2} />);
    svg.push(<text key="dtw-lbl" x={(dx1 + dx2) / 2} y={PAD.t + 14} fill="rgba(206,147,216,0.6)" fontSize={10} fontFamily="sans-serif" textAnchor="middle">DTW 패턴 감지 구간</text>);
  }

  // ── 매매 구간 하이라이트 ──
  if (buyIdx >= 0) {
    const hStart = toX(buyIdx);
    const hEnd = sellIdx >= 0 ? toX(sellIdx) + cw : toX(Math.min(buyIdx + (pos?.hold_days || 5), vis.length - 1)) + cw;
    svg.push(<rect key="zone" x={hStart} y={PAD.t} width={Math.max(hEnd - hStart, cw)} height={H_CHART} fill="rgba(79,195,247,0.06)" stroke="rgba(79,195,247,0.2)" strokeDasharray="4,4" rx={2} />);
    svg.push(<text key="zone-lbl" x={(hStart + hEnd) / 2} y={PAD.t + H_CHART - 10} fill="rgba(79,195,247,0.5)" fontSize={10} fontFamily="sans-serif" textAnchor="middle">매매 구간</text>);
  }

  // ── 가격 눈금 (6단계) ──
  for (let i = 0; i <= 5; i++) {
    const p = pLow + pRange * (i / 5);
    const y = toY(p);
    svg.push(<line key={`pg-${i}`} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(50,70,100,0.25)" strokeDasharray="3,3" />);
    svg.push(<text key={`pl-${i}`} x={PAD.l - 8} y={y + 4} fill="#c8d0e0" fontSize={11} fontFamily="JetBrains Mono, monospace" textAnchor="end" fontWeight={500}>{Math.round(p).toLocaleString()}</text>);
  }

  // ── X축 날짜 라벨 ──
  const dateStep = Math.max(1, Math.floor(vis.length / 14));
  vis.forEach((c, i) => {
    const isBuy = i === buyIdx, isSell = i === sellIdx;
    if (i % dateStep === 0 || isBuy || isSell || i === vis.length - 1) {
      const x = toX(i) + cw / 2;
      const isLast = i === vis.length - 1;
      svg.push(<text key={`dt-${i}`} x={x} y={TOTAL_H - 6}
        fill={isBuy ? '#00E676' : isSell ? '#FFD600' : isLast ? '#e0e6f0' : '#c0c8d8'}
        fontSize={isBuy || isSell || isLast ? 11 : 9}
        fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight={isBuy || isSell || isLast ? 700 : 400}>{fDateS(c.date)}</text>);
    }
  });

  // ── 거래량 구분선 + 라벨 ──
  svg.push(<line key="vol-sep" x1={PAD.l} y1={PAD.t + H_CHART + GAP / 2} x2={W - PAD.r} y2={PAD.t + H_CHART + GAP / 2} stroke="rgba(50,70,100,0.3)" />);
  svg.push(<text key="vol-lbl" x={PAD.l - 8} y={volBase - H_VOL + 12} fill="#556677" fontSize={9} fontFamily="monospace" textAnchor="end">VOL</text>);

  // ── 거래량 바 (영웅문 색상) ──
  vis.forEach((c, i) => {
    const x = toX(i);
    const color = c.close >= c.open ? '#FF0000' : '#0050FF';
    const vol = c.volume || 0;
    const barH = vol > 0 ? Math.max((vol / maxVol) * H_VOL, 2) : (c.close > 0 ? 2 : 0);
    svg.push(<rect key={`vol-${i}`} x={x + 1} y={volBase - barH} width={Math.max(cw - 2, 2)} height={barH} fill={color} opacity={0.75} rx={1} />);
  });

  // ── 캔들스틱 (영웅문: 양봉 빨강 / 음봉 파랑) ──
  vis.forEach((c, i) => {
    const x = toX(i);
    const color = c.close >= c.open ? '#FF0000' : '#0050FF';
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(bodyBot - bodyTop, 3);
    const cx = x + cw / 2;
    svg.push(
      <g key={`c-${i}`}>
        <line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)} stroke={color} strokeWidth={1} />
        <rect x={x + 2} y={bodyTop} width={Math.max(cw - 4, 3)} height={bodyH} fill={color} rx={1} />
      </g>
    );
  });

  // ── MA5 (노란색) ──
  let ma5d = '';
  ma5.forEach((v, i) => { if (v !== null) ma5d += (ma5d ? 'L' : 'M') + `${toX(i) + cw / 2},${toY(v)} `; });
  if (ma5d) svg.push(<path key="ma5" d={ma5d} fill="none" stroke="#ffcc00" strokeWidth={1.5} opacity={0.8} />);

  // ── MA20 (핑크) ──
  let ma20d = '';
  ma20.forEach((v, i) => { if (v !== null) ma20d += (ma20d ? 'L' : 'M') + `${toX(i) + cw / 2},${toY(v)} `; });
  if (ma20d) svg.push(<path key="ma20" d={ma20d} fill="none" stroke="#ff6699" strokeWidth={1.5} opacity={0.7} />);

  // ── 매수가 수평선 + 우측 가격태그 (초록) ──
  if (hasBuy && buyPrice >= pLow && buyPrice <= pHigh) {
    const bpY = toY(buyPrice);
    svg.push(<line key="bp-line" x1={PAD.l} y1={bpY} x2={W - PAD.r} y2={bpY} stroke="#00E676" strokeWidth={1} strokeDasharray="8,4" opacity={0.3} />);
    svg.push(<rect key="bp-tag-bg" x={W - PAD.r + 2} y={bpY - 10} width={PAD.r - 6} height={20} fill="rgba(0,230,118,0.2)" stroke="rgba(0,230,118,0.4)" strokeWidth={0.5} rx={3} />);
    svg.push(<text key="bp-tag" x={W - PAD.r / 2 + 1} y={bpY + 4} fill="#00E676" fontSize={10} fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight={600}>{Math.round(buyPrice).toLocaleString()}</text>);
  }

  // ── 현재가 수평선 + 우측 가격태그 ──
  if (curPrice > 0 && curPrice >= pLow && curPrice <= pHigh) {
    const cpY = toY(curPrice);
    svg.push(<line key="cur-line" x1={PAD.l} y1={cpY} x2={W - PAD.r} y2={cpY} stroke={curColor} strokeWidth={1} strokeDasharray="5,3" opacity={0.5} />);
    svg.push(<rect key="cur-bg" x={W - PAD.r + 2} y={cpY - 10} width={PAD.r - 6} height={20} fill={curColor} rx={3} />);
    svg.push(<text key="cur-txt" x={W - PAD.r / 2 + 1} y={cpY + 4} fill="white" fontSize={10} fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight={600}>{Math.round(curPrice).toLocaleString()}</text>);
  }

  // ── 매수 마커 (▲ 초록) ──
  if (buyIdx >= 0 && buyIdx < vis.length) {
    const bx = toX(buyIdx) + cw / 2;
    const by = toY(vis[buyIdx].low) + 18;
    svg.push(
      <g key="buy-m">
        <line x1={bx} y1={PAD.t} x2={bx} y2={PAD.t + H_CHART} stroke="#00E676" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        <polygon points={`${bx},${by - 14} ${bx - 8},${by} ${bx + 8},${by}`} fill="#00E676" />
        <rect x={bx - 44} y={by + 4} width={88} height={18} fill="rgba(0,230,118,0.15)" stroke="rgba(0,230,118,0.3)" strokeWidth={0.5} rx={4} />
        <text x={bx} y={by + 16} fill="#00E676" fontSize={11} fontFamily="sans-serif" textAnchor="middle" fontWeight={700}>
          매수 {Math.round(buyPrice).toLocaleString()}
        </text>
      </g>
    );
  }

  // ── 매도 마커 (▼ 금색) ──
  if (sellIdx >= 0 && sellIdx < vis.length) {
    const sx = toX(sellIdx) + cw / 2;
    const sy = toY(vis[sellIdx].high) - 8;
    svg.push(
      <g key="sell-m">
        <line x1={sx} y1={PAD.t} x2={sx} y2={PAD.t + H_CHART} stroke="#FFD600" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        <polygon points={`${sx},${sy + 14} ${sx - 8},${sy} ${sx + 8},${sy}`} fill="#FFD600" />
        <rect x={sx - 44} y={sy - 22} width={88} height={18} fill="rgba(255,214,0,0.15)" stroke="rgba(255,214,0,0.3)" strokeWidth={0.5} rx={4} />
        <text x={sx} y={sy - 9} fill="#FFD600" fontSize={11} fontFamily="sans-serif" textAnchor="middle" fontWeight={700}>
          {statusLabel} {Math.round(sellPrice).toLocaleString()}
        </text>
      </g>
    );
  }

  // ── 호버 크로스헤어 ──
  if (hoverIdx !== null && hd) {
    const hx = toX(hoverIdx) + cw / 2;
    const hy = toY(hd.close);
    svg.push(<line key="h-vl" x1={hx} y1={PAD.t} x2={hx} y2={volBase} stroke="rgba(200,220,255,0.3)" strokeWidth={1} strokeDasharray="3,3" />);
    svg.push(<line key="h-hl" x1={PAD.l} y1={hy} x2={W - PAD.r} y2={hy} stroke="rgba(200,220,255,0.3)" strokeWidth={1} strokeDasharray="3,3" />);
    svg.push(<rect key="h-pbg" x={0} y={hy - 9} width={PAD.l - 4} height={18} fill="rgba(30,50,80,0.95)" rx={3} />);
    svg.push(<text key="h-ptx" x={PAD.l - 8} y={hy + 4} fill="#e0e6f0" fontSize={10} fontFamily="JetBrains Mono, monospace" textAnchor="end">{Math.round(hd.close).toLocaleString()}</text>);
  }

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      {/* 범례 + 호버 정보 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        {hd ? (
          <div style={{ display: 'flex', gap: 10, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
            <span style={{ color: '#8899aa' }}>{hd.date ? `${hd.date.slice(0,4)}.${hd.date.slice(4,6)}.${hd.date.slice(6,8)}` : ''}</span>
            <span style={{ color: '#e0e6f0' }}>시 {fmt(hd.open)}</span>
            <span style={{ color: '#FF0000' }}>고 {fmt(hd.high)}</span>
            <span style={{ color: '#0050FF' }}>저 {fmt(hd.low)}</span>
            <span style={{ color: hd.close >= hd.open ? '#FF0000' : '#0050FF' }}>종 {fmt(hd.close)}</span>
            <span style={{ color: '#8899aa' }}>거래량 {fmt(hd.volume)}</span>
          </div>
        ) : <div />}
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          <span><span style={{ color: '#FF0000' }}>■</span> 양봉</span>
          <span><span style={{ color: '#0050FF' }}>■</span> 음봉</span>
          <span style={{ color: '#ffcc00' }}>── MA5</span>
          <span style={{ color: '#ff6699' }}>── MA20</span>
          {hasBuy && <span><span style={{ color: '#00E676' }}>▲</span> 매수</span>}
          {hasSell && <span><span style={{ color: '#FFD600' }}>▼</span> 매도</span>}
          {buyIdx >= 0 && <span style={{ color: '#ce93d8' }}>■ DTW</span>}
        </div>
      </div>

      <svg width={W} height={TOTAL_H} style={{ display: 'block', maxWidth: '100%', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        {svg}
      </svg>

      {/* 하단 정보 바 (매수 정보 있을 때만) */}
      {hasBuy && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '8px 14px',
          background: 'rgba(15,22,42,0.6)', borderRadius: 8, fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace', border: '1px solid rgba(50,70,100,0.2)', flexWrap: 'wrap', gap: 6,
        }}>
          <span><span style={{ color: '#556677' }}>매수가 </span><span style={{ color: '#00E676' }}>{fmt(Math.round(buyPrice))}</span></span>
          <span><span style={{ color: '#556677' }}>현재가 </span><span style={{ color: profitColor }}>{fmt(curPrice)}</span></span>
          <span><span style={{ color: '#556677' }}>수익률 </span><span style={{ color: profitColor }}>{profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%</span></span>
          {pos?.hold_days != null && <span><span style={{ color: '#556677' }}>보유일 </span><span style={{ color: '#e0e6f0' }}>{pos.hold_days}일</span></span>}
          {pos?.similarity != null && <span><span style={{ color: '#556677' }}>유사도 </span><span style={{ color: '#4fc3f7' }}>{pos.similarity}%</span></span>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Auto Trade Panel (자동 손절/익절)
// ============================================================
const AUTO_TRADE_STORAGE_KEY = "kis_auto_trade_rules";

function AutoTradePanel({ mode = "virtual" }) {
  // 패턴탐지기 전략 동기화: localStorage에서 읽기
  const initStrategy = (() => {
    try { return JSON.parse(localStorage.getItem('kis_auto_trade_strategy')) || {}; } catch { return {}; }
  })();

  const [rules, setRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`${AUTO_TRADE_STORAGE_KEY}_${mode}`) || "[]"); } catch { return []; }
  });
  const [monitoring, setMonitoring] = useState(false);
  const [logs, setLogs] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loadingBal, setLoadingBal] = useState(false);
  const intervalRef = useRef(null);
  const checkRef = useRef(null); // 최신 checkAndExecute 참조용
  const [intervalSec, setIntervalSec] = useState(30);
  const [globalTP, setGlobalTP] = useState(initStrategy.tp ?? 7);
  const [globalSL, setGlobalSL] = useState(initStrategy.sl ?? 3);
  const [globalMaxDays, setGlobalMaxDays] = useState(initStrategy.days ?? 10);

  // 규칙 저장
  const saveRules = useCallback((r) => {
    setRules(r);
    try { localStorage.setItem(`${AUTO_TRADE_STORAGE_KEY}_${mode}`, JSON.stringify(r)); } catch {}
    // ★ 서버사이드 자동매매에도 동기화
    syncRulesToBackend(mode, r);
  }, [mode]);

  // 잔고 조회 → 보유종목 로드
  const loadPositions = useCallback(async () => {
    setLoadingBal(true);
    const r = await kisApi("balance");
    if (r?.success && r.positions) {
      setPositions(r.positions);
      // 새 종목이 추가되었으면 규칙에 자동 등록
      const existing = new Set(rules.map(r => r.stock_code));
      const newRules = [...rules];
      r.positions.forEach(p => {
        if (!existing.has(p.stock_code)) {
          newRules.push({
            stock_code: p.stock_code,
            stock_name: p.stock_name,
            take_profit_pct: globalTP,
            stop_loss_pct: globalSL,
            max_hold_days: globalMaxDays,
            enabled: true,
            buy_date: new Date().toISOString().slice(0, 10),
          });
        }
      });
      if (newRules.length !== rules.length) saveRules(newRules);
    }
    setLoadingBal(false);
  }, [rules, globalTP, globalSL, globalMaxDays, saveRules]);

  // 로그 추가
  const addLog = useCallback((msg) => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString('ko-KR'), msg }, ...prev].slice(0, 50));
  }, []);

  // 자동매매 체크 1회 실행
  const checkAndExecute = useCallback(async () => {
    addLog("잔고 조회 중...");
    const bal = await kisApi("balance");
    if (!bal?.success) { addLog("❌ 잔고 조회 실패"); return; }

    const posMap = {};
    (bal.positions || []).forEach(p => { posMap[p.stock_code] = p; });
    setPositions(bal.positions || []);

    const activeRules = rules.filter(r => r.enabled && posMap[r.stock_code]);
    if (activeRules.length === 0) { addLog("활성 규칙 없음 (보유종목 매칭 0건)"); return; }

    addLog(`${activeRules.length}개 종목 모니터링 중...`);
    const journalMode = mode === 'real' ? 'real' : 'mock';

    for (const rule of activeRules) {
      const pos = posMap[rule.stock_code];
      const profitRate = pos.profit_rate || 0;
      const holdDays = rule.buy_date
        ? Math.floor((Date.now() - new Date(rule.buy_date).getTime()) / 86400000)
        : 0;
      const stratType = rule.strategy || 'fixed';

      let reason = null;

      if (stratType === 'smart') {
        // ━━━ 스마트형: 트레일링 스탑 ━━━
        const graceD = rule.grace_days ?? 7;
        const slPct = rule.stop_loss_pct ?? 12;
        const trailingPct = rule.trailing_stop_pct ?? 5;
        const activationPct = rule.profit_activation_pct ?? 15;
        let peak = rule.peak_price ?? 0;
        // peak_price 업데이트
        if (pos.current_price > peak) {
          peak = pos.current_price;
          saveRules(rules.map(r => r.stock_code === rule.stock_code ? { ...r, peak_price: peak } : r));
        }
        if (holdDays > graceD) {
          const peakProfit = peak > 0 && rule.buy_price > 0 ? ((peak - rule.buy_price) / rule.buy_price * 100) : 0;
          if (peakProfit >= activationPct && peak > 0) {
            const dropFromPeak = ((pos.current_price - peak) / peak * 100);
            if (dropFromPeak <= -trailingPct) {
              reason = `트레일링 (최고${peakProfit.toFixed(1)}%→현재${profitRate.toFixed(1)}%, 하락${dropFromPeak.toFixed(1)}%)`;
            }
          }
          if (!reason && profitRate <= -slPct) {
            reason = `손절 (수익률 ${profitRate.toFixed(2)}% ≤ -${slPct}%)`;
          }
        }
        if (!reason && rule.max_hold_days > 0 && holdDays >= rule.max_hold_days) {
          reason = `만기매도 (보유 ${holdDays}일 ≥ ${rule.max_hold_days}일)`;
        }
      } else {
        // ━━━ 고정형: 기존 로직 ━━━
        if (profitRate >= rule.take_profit_pct) reason = `익절 (수익률 ${profitRate.toFixed(2)}% ≥ ${rule.take_profit_pct}%)`;
        else if (profitRate <= -rule.stop_loss_pct) reason = `손절 (수익률 ${profitRate.toFixed(2)}% ≤ -${rule.stop_loss_pct}%)`;
        else if (rule.max_hold_days > 0 && holdDays >= rule.max_hold_days) reason = `만기매도 (보유 ${holdDays}일 ≥ ${rule.max_hold_days}일)`;
      }

      if (!reason) {
        const tag = stratType === 'smart' ? '[스마트]' : '[고정]';
        addLog(`  ${pos.stock_name}(${pos.stock_code}) ${tag} 수익률 ${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}% → 유지`);
        continue;
      }

      // 자동 매도 실행
      addLog(`🔔 ${pos.stock_name}(${pos.stock_code}) [${stratType}] ${reason} → 시장가 매도 실행`);
      const sellResult = await kisApi("order/sell", {}, {
        method: "POST",
        body: JSON.stringify({
          stock_code: pos.stock_code,
          qty: pos.qty,
          price: 0,
          order_type: "01", // 시장가
        }),
      });

      if (sellResult?.success) {
        addLog(`✅ ${pos.stock_name} 매도 성공! 주문번호: ${sellResult.order_no}`);

        // 매매 일지 자동 기록
        try {
          const realizedPnl = pos.profit_loss || 0;
          const realizedPnlPct = pos.profit_rate || 0;
          await supabase.from('trade_journal').insert({
            mode: journalMode,
            trade_type: 'sell',
            stock_code: pos.stock_code,
            stock_name: pos.stock_name,
            price: pos.current_price,
            quantity: pos.qty,
            amount: pos.current_price * pos.qty,
            realized_pnl: realizedPnl,
            realized_pnl_pct: Math.round(realizedPnlPct * 100) / 100,
            cash_balance: (bal.summary?.deposit || 0) + pos.eval_amount,
            order_no: sellResult.order_no || '',
            memo: `자동매매 ${reason}`,
            trade_date: new Date().toISOString(),
          });
          addLog(`📋 매매 일지 기록 완료: ${pos.stock_name} ${reason}`);
        } catch (e) {
          addLog(`⚠️ 매매 일지 기록 실패: ${e.message}`);
        }

        // 매도된 종목 규칙 비활성화
        saveRules(rules.map(r => r.stock_code === pos.stock_code ? { ...r, enabled: false } : r));
      } else {
        addLog(`❌ ${pos.stock_name} 매도 실패: ${sellResult?.message || sellResult?.detail || '알 수 없는 오류'}`);
      }
    }
    addLog("체크 완료");
  }, [rules, mode, addLog, saveRules]);

  // checkRef를 항상 최신 checkAndExecute로 유지 (interval 내 stale closure 방지)
  useEffect(() => { checkRef.current = checkAndExecute; }, [checkAndExecute]);

  // 모니터링 시작/정지
  const startMonitoring = useCallback((sec) => {
    const interval = sec || intervalSec;
    setMonitoring(true);
    addLog(`▶️ 모니터링 시작 (${interval}초 간격)`);
    checkRef.current?.();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => checkRef.current?.(), interval * 1000);
  }, [intervalSec, addLog]);

  const stopMonitoring = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setMonitoring(false);
    addLog("⏹️ 모니터링 정지");
  }, [addLog]);

  const toggleMonitoring = useCallback(() => {
    if (monitoring) stopMonitoring();
    else startMonitoring();
  }, [monitoring, startMonitoring, stopMonitoring]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // ── 마운트 시 자동 초기화: 백그라운드 인계 + 보유종목 로드 + 전략 동기화 + 모니터링 시작 ──
  const autoInitRef = useRef(false);
  useEffect(() => {
    if (autoInitRef.current) return;
    autoInitRef.current = true;

    // 0. 백그라운드 글로벌 모니터가 실행 중이면 인계 (중복 방지)
    if (isKisAutoTradeRunning(mode)) {
      stopKisAutoTrade(mode);
      // 백그라운드 로그 가져오기
      const bgLogs = getKisAutoTradeLogs(mode);
      if (bgLogs.length > 0) setLogs(bgLogs);
    }

    // 1. 패턴탐지기 전략값으로 기존 규칙 동기화
    const tp = initStrategy.tp ?? 7;
    const sl = initStrategy.sl ?? 3;
    const days = initStrategy.days ?? 10;
    // ★ 스마트형 트레일링 스탑 파라미터
    const trailing = initStrategy.trailing ?? 0;
    const grace = initStrategy.grace ?? 0;
    const activation = initStrategy.activation ?? 15;
    const strategyType = trailing > 0 ? 'smart' : 'fixed';
    setRules(prev => {
      if (prev.length === 0) return prev;
      const updated = prev.map(r => ({
        ...r, take_profit_pct: tp, stop_loss_pct: sl, max_hold_days: days,
        strategy: strategyType, trailing_stop_pct: trailing,
        profit_activation_pct: activation, grace_days: grace,
      }));
      try { localStorage.setItem(`${AUTO_TRADE_STORAGE_KEY}_${mode}`, JSON.stringify(updated)); } catch {}
      return updated;
    });

    // 2. 보유종목 자동 로드 → 완료 후 모니터링 자동 시작
    (async () => {
      setLoadingBal(true);
      const r = await kisApi("balance");
      if (r?.success && r.positions) {
        setPositions(r.positions);
        setRules(prev => {
          const existing = new Set(prev.map(x => x.stock_code));
          const newRules = [...prev];
          r.positions.forEach(p => {
            if (!existing.has(p.stock_code)) {
              newRules.push({
                stock_code: p.stock_code, stock_name: p.stock_name,
                take_profit_pct: tp, stop_loss_pct: sl, max_hold_days: days,
                enabled: true, buy_date: new Date().toISOString().slice(0, 10),
              });
            }
          });
          if (newRules.length !== prev.length) {
            try { localStorage.setItem(`${AUTO_TRADE_STORAGE_KEY}_${mode}`, JSON.stringify(newRules)); } catch {}
          }
          return newRules;
        });
      }
      setLoadingBal(false);

      // 3. 30초 간격 자동 모니터링 시작
      setIntervalSec(30);
      setMonitoring(true);
      addLog(`▶️ 자동 모니터링 시작 (30초 간격)`);
      setTimeout(() => {
        checkRef.current?.();
        intervalRef.current = setInterval(() => checkRef.current?.(), 30 * 1000);
      }, 500);

      // 4. ★ 서버사이드 자동매매를 위해 백엔드에 규칙 동기화
      try {
        const currentRules = JSON.parse(localStorage.getItem(`${AUTO_TRADE_STORAGE_KEY}_${mode}`) || '[]');
        if (currentRules.length > 0) syncRulesToBackend(mode, currentRules);
      } catch {}
    })();

    // autostart 플래그 소비
    try { localStorage.removeItem(`kis_auto_trade_sync_${mode}`); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 규칙 수정
  const updateRule = (code, field, value) => {
    saveRules(rules.map(r => r.stock_code === code ? { ...r, [field]: value } : r));
  };

  const removeRule = (code) => saveRules(rules.filter(r => r.stock_code !== code));

  // 전체 일괄 설정
  const applyGlobalSettings = () => {
    saveRules(rules.map(r => ({
      ...r,
      take_profit_pct: globalTP,
      stop_loss_pct: globalSL,
      max_hold_days: globalMaxDays,
    })));
    addLog(`전체 규칙 일괄 변경: 익절 ${globalTP}% / 손절 ${globalSL}% / 최대보유 ${globalMaxDays}일`);
  };

  // ── 종목 차트 모달 ──
  const [chartStock, setChartStock] = useState(null); // { stock_code, stock_name }
  const [chartCandles, setChartCandles] = useState(null);
  const [chartQuote, setChartQuote] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);

  const openChart = async (stockCode, stockName) => {
    setChartStock({ stock_code: stockCode, stock_name: stockName });
    setChartCandles(null);
    setChartQuote(null);
    setChartLoading(true);
    const [c, q] = await Promise.all([
      kisApi("chart", { code: stockCode, period: "D" }),
      kisApi("quote", { code: stockCode }),
    ]);
    if (c?.success) setChartCandles(c.candles);
    if (q?.success) setChartQuote(q);
    setChartLoading(false);
  };

  const isVirtual = mode === 'virtual';
  const accent = isVirtual ? '#60a5fa' : '#ef4444';

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 상태 + 시작/정지 */}
      <div style={{ ...S.panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e0e6f0', marginBottom: 4 }}>
            🤖 자동 손절/익절
          </div>
          <div style={{ fontSize: 11, color: '#6688aa' }}>
            보유종목 수익률을 주기적으로 체크하여 조건 도달 시 자동 시장가 매도 · 탭 진입 시 자동 시작
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 8px', background: 'rgba(0,200,120,0.15)', borderRadius: 10, border: '1px solid rgba(0,200,120,0.3)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c878', display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: '#00c878', fontWeight: 600 }}>서버 자동매매 활성 (브라우저 종료 후에도 동작)</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: '#6688aa' }}>체크 주기</label>
          <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))}
            disabled={monitoring}
            style={{ padding: '4px 8px', background: 'rgba(10,18,40,0.8)', border: '1px solid rgba(100,140,200,0.2)', borderRadius: 6, color: '#e0e6f0', fontSize: 12 }}>
            <option value={10}>10초</option>
            <option value={30}>30초</option>
            <option value={60}>1분</option>
            <option value={180}>3분</option>
            <option value={300}>5분</option>
          </select>
          <button onClick={toggleMonitoring} style={{
            padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: monitoring
              ? 'linear-gradient(135deg, #8b0000, #cc0000)'
              : `linear-gradient(135deg, ${isVirtual ? '#1a5a3e' : '#1a3a6e'}, ${isVirtual ? '#2a8a5e' : '#2a5098'})`,
            color: '#fff',
          }}>
            {monitoring ? '⏹ 정지' : '▶ 모니터링 시작'}
          </button>
        </div>
      </div>

      {/* 전체 규칙 설정 */}
      <div style={{ ...S.panel }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e6f0' }}>전체 규칙 설정</div>
          {initStrategy.tp != null && (
            <span style={{ fontSize: 10, color: '#4cff8b', opacity: 0.8 }}>
              🔗 패턴탐지기 전략 동기화됨 (익절 {initStrategy.tp}% / 손절 {initStrategy.sl}% / {initStrategy.days}일)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={S.label}>익절 (%)</label>
            <input type="number" value={globalTP} onChange={e => setGlobalTP(Number(e.target.value))}
              style={{ ...S.input, width: 80 }} />
          </div>
          <div>
            <label style={S.label}>손절 (%)</label>
            <input type="number" value={globalSL} onChange={e => setGlobalSL(Number(e.target.value))}
              style={{ ...S.input, width: 80 }} />
          </div>
          <div>
            <label style={S.label}>최대보유 (일)</label>
            <input type="number" value={globalMaxDays} onChange={e => setGlobalMaxDays(Number(e.target.value))}
              style={{ ...S.input, width: 80 }} />
          </div>
          <button onClick={applyGlobalSettings} style={{ ...S.btn(), padding: '8px 16px', fontSize: 12 }}>전체 적용</button>
          <button onClick={loadPositions} disabled={loadingBal}
            style={{ ...S.btn('#333', '#444'), padding: '8px 16px', fontSize: 12 }}>
            {loadingBal ? '조회 중...' : '보유종목 새로고침'}
          </button>
        </div>
      </div>

      {/* 종목별 규칙 */}
      {rules.length > 0 && (
        <div style={S.panel}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e6f0', marginBottom: 10 }}>
            종목별 규칙 ({rules.length}개)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['활성', '종목', '전략', '익절%', '손절%', '최대보유일', '현재수익률', '삭제'].map(h =>
                  <th key={h} style={S.th}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rules.map(r => {
                const pos = positions.find(p => p.stock_code === r.stock_code);
                const pRate = pos?.profit_rate || 0;
                return (
                  <tr key={r.stock_code}>
                    <td style={S.td}>
                      <input type="checkbox" checked={r.enabled} onChange={e => updateRule(r.stock_code, 'enabled', e.target.checked)} />
                    </td>
                    <td style={{ ...S.td, color: '#e0e6f0', fontWeight: 600 }}>
                      <span onClick={() => openChart(r.stock_code, r.stock_name)}
                        style={{ cursor: 'pointer', borderBottom: '1px dashed rgba(100,140,200,0.3)' }}
                        title="클릭하여 차트 보기">
                        {r.stock_name}
                      </span> <span style={{ color: '#6688aa', fontSize: 10 }}>{r.stock_code}</span>
                    </td>
                    <td style={{ ...S.td, fontSize: 10 }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: r.strategy === 'smart' ? 'rgba(255,152,0,0.2)' : 'rgba(100,140,200,0.15)',
                        color: r.strategy === 'smart' ? '#ff9800' : '#8899bb',
                      }}>
                        {r.strategy === 'smart' ? '🧠스마트' : '📊고정'}
                      </span>
                    </td>
                    <td style={S.td}>
                      <input type="number" value={r.take_profit_pct} onChange={e => updateRule(r.stock_code, 'take_profit_pct', Number(e.target.value))}
                        style={{ ...S.input, width: 60, padding: '4px 6px', fontSize: 11 }} />
                    </td>
                    <td style={S.td}>
                      <input type="number" value={r.stop_loss_pct} onChange={e => updateRule(r.stock_code, 'stop_loss_pct', Number(e.target.value))}
                        style={{ ...S.input, width: 60, padding: '4px 6px', fontSize: 11 }} />
                    </td>
                    <td style={S.td}>
                      <input type="number" value={r.max_hold_days} onChange={e => updateRule(r.stock_code, 'max_hold_days', Number(e.target.value))}
                        style={{ ...S.input, width: 60, padding: '4px 6px', fontSize: 11 }} />
                    </td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600, color: clr(pRate) }}>
                      {pos ? `${pRate >= 0 ? '+' : ''}${pRate.toFixed(2)}%` : '—'}
                    </td>
                    <td style={S.td}>
                      <button onClick={() => removeRule(r.stock_code)} style={{
                        background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff4444', fontSize: 14,
                      }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 실행 로그 */}
      <div style={S.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e6f0' }}>
            실행 로그 {monitoring && <span style={{ color: '#4cff8b', fontSize: 11 }}>● 모니터링 중</span>}
          </div>
          <button onClick={() => setLogs([])} style={{ ...S.btn('#333', '#444'), padding: '4px 10px', fontSize: 10 }}>지우기</button>
        </div>
        <div style={{
          maxHeight: 200, overflowY: 'auto', background: 'rgba(10,18,40,0.6)', borderRadius: 8, padding: 10,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        }}>
          {logs.length === 0
            ? <div style={{ color: '#556677', textAlign: 'center', padding: 20 }}>모니터링을 시작하면 로그가 표시됩니다</div>
            : logs.map((l, i) => (
              <div key={i} style={{ color: l.msg.includes('✅') ? '#4cff8b' : l.msg.includes('❌') ? '#ff4c4c' : l.msg.includes('🔔') ? '#ffd54f' : '#8899aa', marginBottom: 2 }}>
                <span style={{ color: '#556677' }}>[{l.time}]</span> {l.msg}
              </div>
            ))
          }
        </div>
      </div>

      {/* 종목 차트 모달 */}
      {chartStock && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setChartStock(null)}>
          <div style={{
            background: '#0d1525', border: '1px solid rgba(100,140,200,0.25)',
            borderRadius: 16, padding: 24, width: 880, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }} onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 17, fontWeight: 700, color: '#e0e6f0' }}>
                  📊 {chartStock.stock_name}
                </span>
                <span style={{ fontSize: 11, color: '#6688aa', marginLeft: 8 }}>{chartStock.stock_code}</span>
                {chartQuote && (
                  <span style={{ marginLeft: 16, fontSize: 20, fontWeight: 700, color: clr(chartQuote.change), fontFamily: "'JetBrains Mono',monospace" }}>
                    {fmt(chartQuote.price)}
                    <span style={{ fontSize: 12, color: clr(chartQuote.change), marginLeft: 6 }}>
                      {chartQuote.change > 0 ? '▲' : chartQuote.change < 0 ? '▼' : '—'} {fmt(Math.abs(chartQuote.change))} ({fmtPct(chartQuote.change_rate)})
                    </span>
                  </span>
                )}
              </div>
              <button onClick={() => setChartStock(null)} style={{
                background: 'transparent', border: 'none', color: '#6688aa', fontSize: 20, cursor: 'pointer',
              }}>✕</button>
            </div>

            {/* 시세 정보 */}
            {chartQuote && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                {[['시가', chartQuote.open], ['고가', chartQuote.high], ['저가', chartQuote.low],
                  ['거래량', chartQuote.volume], ['PER', chartQuote.per?.toFixed(1)], ['PBR', chartQuote.pbr?.toFixed(2)]].map(([l, v]) => (
                  <div key={l} style={{ padding: '6px 12px', background: 'rgba(25,35,65,0.6)', borderRadius: 6, border: '1px solid rgba(100,140,200,0.1)' }}>
                    <div style={{ color: '#556677', fontSize: 9 }}>{l}</div>
                    <div style={{ color: '#e0e6f0', fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>{typeof v === 'number' ? fmt(v) : v || '—'}</div>
                  </div>
                ))}
                {(() => {
                  const pos = positions.find(p => p.stock_code === chartStock.stock_code);
                  if (!pos) return null;
                  return <>
                    <div style={{ padding: '6px 12px', background: 'rgba(0,230,118,0.06)', borderRadius: 6, border: '1px solid rgba(0,230,118,0.15)' }}>
                      <div style={{ color: '#00E676', fontSize: 9 }}>매수가</div>
                      <div style={{ color: '#00E676', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{fmt(pos.buy_price)}</div>
                    </div>
                    <div style={{ padding: '6px 12px', background: 'rgba(25,35,65,0.6)', borderRadius: 6, border: '1px solid rgba(100,140,200,0.1)' }}>
                      <div style={{ color: '#556677', fontSize: 9 }}>수익률</div>
                      <div style={{ color: clr(pos.profit_rate), fontSize: 12, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{fmtPct(pos.profit_rate)}</div>
                    </div>
                    <div style={{ padding: '6px 12px', background: 'rgba(25,35,65,0.6)', borderRadius: 6, border: '1px solid rgba(100,140,200,0.1)' }}>
                      <div style={{ color: '#556677', fontSize: 9 }}>평가손익</div>
                      <div style={{ color: clr(pos.profit_loss), fontSize: 12, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>{fmtWon(pos.profit_loss)}</div>
                    </div>
                  </>;
                })()}
              </div>
            )}

            {/* 차트 */}
            {chartLoading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#6688aa' }}>📊 차트 로딩 중...</div>
            ) : chartCandles && chartCandles.length > 0 ? (
              <StockChart
                candles={chartCandles.slice(0, 100)}
                buyPrice={positions.find(p => p.stock_code === chartStock.stock_code)?.buy_price}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#556677' }}>차트 데이터를 불러올 수 없습니다</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 레거시 호환
function MiniCandleChart({ candles, width = 600, height = 250 }) {
  return <StockChart candles={candles} />;
}
