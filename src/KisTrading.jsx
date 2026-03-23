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
  return STOCK_MAP.filter(([code, name]) => name.toLowerCase().includes(kw) || code.includes(kw))
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
  // 2차: 백엔드 종목 마스터파일 검색
  try {
    const r = await fetch(`${BACKEND_API}/api/stock-search?keyword=${encodeURIComponent(v)}&limit=5`).then(r => r.json());
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
      profit_activation_pct: r.profit_activation_pct ?? 10,
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
        // const grace = rule.grace_days ?? 7;  // ★ 유예기간 보류
        const sl = rule.stop_loss_pct ?? 10;
        const trailing = rule.trailing_stop_pct ?? 5;
        const activation = rule.profit_activation_pct ?? 10;
        let peak = rule.peak_price ?? 0;
        // peak_price 업데이트 (로컬)
        if (pos.current_price > peak) {
          peak = pos.current_price;
          rule.peak_price = peak;
          try { localStorage.setItem(`${AUTO_TRADE_RULES_KEY}_${mode}`, JSON.stringify(rules)); } catch {}
        }
        if (holdDays > 0) {  // ★ 유예기간 보류 (기존: holdDays > grace)
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
    { id: "tradeLog", label: "매매이력", icon: "📒" },
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
      {tab === "tradeLog" && <TradeLogPanel key={mode} mode={mode} />}
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
  // ★ 예비후보 차트
  const [candChartStock, setCandChartStock] = useState(null);
  const [candChartCandles, setCandChartCandles] = useState(null);
  const [candChartLoading, setCandChartLoading] = useState(false);
  const [candQuoteData, setCandQuoteData] = useState(null);
  // ★ 스마트 매매 관리 포지션 (위험관리 알림용)
  const [tradeRulesMap, setTradeRulesMap] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const activeMode = getKisActiveMode();
    const accountType = activeMode === "real" ? "real" : "virtual";
    const [r, stratResp] = await Promise.all([
      kisApi("balance"),
      fetch(`${BACKEND_API}/api/kis/strategy/positions?account_type=${accountType}&status=holding`).then(r => r.json()).catch(() => ({ positions: [] })),
    ]);
    setData(r);
    // ★ 전략 관리 포지션에서 매수일/손절선/보유일 매핑
    const rMap = {};
    (stratResp?.positions || []).forEach(pos => {
      rMap[pos.stock_code] = {
        stock_code: pos.stock_code,
        buy_date: pos.buy_date,
        sl_pct: pos.stop_loss_pct || 10,
        max_hold_days: pos.max_hold_days || 30,
        hold_days: pos.hold_days || 0,
        strategy: pos.strategy || "smart",
        trailing_stop_pct: pos.trailing_stop_pct || 5,
        profit_activation_pct: pos.profit_activation_pct || 10,
        trailing_activated: pos.trailing_activated || false,
        peak_price: pos.peak_price || 0,
      };
    });
    setTradeRulesMap(rMap);
    setLoading(false);
    // ★ 미등록 종목 자동 등록: 보유 중인데 전략 관리에 없는 종목이 있으면 전략 체크 실행
    if (r?.success && r.positions?.length > 0) {
      const unmanaged = r.positions.filter(p => !rMap[p.stock_code]);
      if (unmanaged.length > 0) {
        console.log(`[KIS] 미등록 종목 ${unmanaged.length}건 자동 등록 시작:`, unmanaged.map(p => p.stock_name));
        fetch(`${BACKEND_API}/api/kis/strategy/check?account_type=${accountType}&auto_sell=false`, { method: "POST" })
          .then(r => r.json())
          .then(data => {
            console.log("[KIS] 미등록 종목 자동 등록 완료:", data);
            // 등록 후 전략 포지션 다시 로드
            fetch(`${BACKEND_API}/api/kis/strategy/positions?account_type=${accountType}&status=holding`)
              .then(r => r.json())
              .then(resp => {
                const newMap = {};
                (resp?.positions || []).forEach(pos => {
                  newMap[pos.stock_code] = {
                    stock_code: pos.stock_code, buy_date: pos.buy_date,
                    sl_pct: pos.stop_loss_pct || 10, max_hold_days: pos.max_hold_days || 30,
                    hold_days: pos.hold_days || 0, strategy: pos.strategy || "smart",
                    trailing_stop_pct: pos.trailing_stop_pct || 5, profit_activation_pct: pos.profit_activation_pct || 10,
                    trailing_activated: pos.trailing_activated || false, peak_price: pos.peak_price || 0,
                  };
                });
                setTradeRulesMap(newMap);
              }).catch(() => {});
          }).catch(e => console.error("[KIS] 미등록 종목 자동 등록 실패:", e));
      }
    }
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

  // ★ 예비 후보 종목 로드 + 실시간 가격 조회
  const loadCandidates = useCallback(async () => {
    setCandLoading(true);
    try {
      const { data: cands } = await supabase.from('buy_candidates')
        .select('*').eq('status', 'active')
        .order('composite_score', { ascending: false }).limit(20);
      if (cands && cands.length > 0) {
        setCandidates(cands); // DB 데이터 먼저 표시
        // 실시간 가격 병렬 조회
        const prices = await Promise.all(
          cands.map(c => kisApi("quote", { code: c.code }).catch(() => null))
        );
        const updated = cands.map((c, i) => {
          const q = prices[i];
          if (q?.success && q.price) {
            return { ...c, current_price: q.price, change_rate: q.change_rate, change: q.change };
          }
          return c;
        });
        setCandidates(updated);
      } else {
        setCandidates([]);
      }
    } catch (e) { console.error('후보 로드 실패:', e); }
    setCandLoading(false);
  }, []);

  // ★ 예비후보 차트 열기
  const openCandidateChart = async (c) => {
    if (candChartStock?.code === c.code) {
      setCandChartStock(null); setCandChartCandles(null); setCandQuoteData(null);
      return;
    }
    setCandChartStock(c);
    setCandChartCandles(null);
    setCandChartLoading(true);
    try {
      const [chartRes, quoteRes] = await Promise.all([
        kisApi("chart", { code: c.code, period: "D" }),
        kisApi("quote", { code: c.code }),
      ]);
      if (chartRes?.success) setCandChartCandles(chartRes.candles);
      if (quoteRes?.success) setCandQuoteData(quoteRes);
    } catch (e) { console.error('후보 차트 로드 실패:', e); }
    setCandChartLoading(false);
  };

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

  // ★ 전략 체크 실행 (트레일링 포함)
  const [stratChecking, setStratChecking] = useState(false);
  const [stratResult, setStratResult] = useState(null);
  const runStrategyCheck = async () => {
    setStratChecking(true);
    setStratResult(null);
    try {
      const activeMode = getKisActiveMode();
      const accountType = activeMode === "real" ? "real" : "virtual";
      const r = await fetch(`${BACKEND_API}/api/kis/strategy/check?account_type=${accountType}&auto_sell=true`, { method: "POST" });
      const data = await r.json();
      setStratResult(data);
      // 매도/매수가 발생했으면 잔고 새로고침
      if (data?.signals_count > 0 || data?.auto_buy?.action === "buy") {
        setTimeout(() => { load(); loadCandidates(); }, 2000);
      }
    } catch (e) { setStratResult({ error: e.message }); }
    setStratChecking(false);
  };

  // ★ 수동 자동투자 실행
  const [autoInvesting, setAutoInvesting] = useState(false);
  const [autoInvestResult, setAutoInvestResult] = useState(null);
  const runAutoInvest = async () => {
    setAutoInvesting(true);
    setAutoInvestResult(null);
    try {
      const activeMode = getKisActiveMode();
      const accountType = activeMode === "real" ? "real" : "virtual";
      const r = await fetch(`${BACKEND_API}/api/kis/strategy/auto-invest?account_type=${accountType}`, { method: "POST" });
      const data = await r.json();
      setAutoInvestResult(data);
      if (data?.action === "buy") {
        setTimeout(() => { load(); loadCandidates(); }, 2000);
      }
    } catch (e) { setAutoInvestResult({ error: e.message }); }
    setAutoInvesting(false);
  };

  useEffect(() => { load(); loadOrders(); loadPending(); loadCandidates(); }, [load, loadOrders, loadPending, loadCandidates]);

  if (loading) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#6688aa" }}>대시보드 로딩 중...</div>;
  if (!data?.success) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#ff9800" }}>잔고 조회 실패 - KIS API 설정을 확인하세요</div>;

  const { positions, summary } = data;
  const GOAL = 10000000;
  const initCap = 1000000;
  // 추정자산 = 예수금 + 주식평가 (서버에서 계산, 폴백 로컬)
  const totalAssets = summary.total_assets || (summary.deposit + summary.total_eval);
  const tgtPct = totalAssets ? (totalAssets / GOAL * 100) : 0;
  const remaining = Math.max(0, GOAL - totalAssets);
  const cashRatio = totalAssets > 0 ? (summary.deposit / totalAssets * 100) : 0;
  const investRatio = 100 - cashRatio;
  // 수익률: API 값이 0이면 직접 계산 (총손익 / 총매입 * 100)
  const profitRate = summary.profit_rate || (summary.total_buy > 0 ? (summary.total_profit / summary.total_buy * 100) : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ★ 상단 요약 카드 2행 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* 주요 3카드: 추정자산, 총손익, 수익률 */}
        {[
          ["💰", "추정자산", `${fmt(totalAssets)}원`, clr(summary.total_profit), null],
          ["📊", "총 손익", fmtWon(summary.total_profit), clr(summary.total_profit), null],
          ["📈", "수익률", fmtPct(profitRate), clr(profitRate), null],
        ].map(([icon, title, value, color, sub]) => (
          <div key={title} style={{ ...S.panel, flex: 1, minWidth: 160 }}>
            <div style={{ color: "#6688aa", fontSize: 11, marginBottom: 4 }}>{icon} {title}</div>
            <div style={{ color, fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{value}</div>
            {sub && <div style={{ color: "#556677", fontSize: 9, marginTop: 2 }}>{sub}</div>}
          </div>
        ))}
      </div>
      {/* 보조 정보행: 예수금, 총매입, 총평가, 현금비율 */}
      <div style={{ ...S.panel, display: "flex", gap: 16, flexWrap: "wrap", padding: "10px 16px", alignItems: "center" }}>
        {[
          ["예수금", `${fmt(summary.deposit)}원`, "#64b5f6"],
          ["총매입", `${fmt(summary.total_buy)}원`, "#e0e6f0"],
          ["총평가", `${fmt(summary.total_eval)}원`, clr(summary.total_profit)],
          ["현금비율", `${cashRatio.toFixed(1)}%`, cashRatio > 50 ? "#64b5f6" : cashRatio > 20 ? "#f59e0b" : "#ff4444"],
        ].map(([l, v, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#556677", fontSize: 11 }}>{l}</span>
            <span style={{ color: c, fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{v}</span>
          </div>
        ))}
        {/* 현금/투자 비율 바 */}
        <div style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#556677", fontSize: 10 }}>투자</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(100,181,246,0.15)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${investRatio}%`, height: "100%", background: "linear-gradient(90deg,#ff9800,#f44336)", borderRadius: "4px 0 0 4px" }} />
            <div style={{ width: `${cashRatio}%`, height: "100%", background: "linear-gradient(90deg,#42a5f5,#64b5f6)", borderRadius: "0 4px 4px 0" }} />
          </div>
          <span style={{ color: "#556677", fontSize: 10 }}>현금</span>
        </div>
      </div>

      {/* ★ 위험관리 알림 배너 */}
      {positions.length > 0 && (() => {
        const warnings = [];
        positions.forEach(p => {
          const rule = tradeRulesMap[p.stock_code];
          const rate = p.profit_rate || 0;
          // 손절 근접 경고 (손절선 3% 이내) — 스마트 매매 등록 종목
          if (rule && rule.sl_pct && rate < 0 && Math.abs(rate) >= (rule.sl_pct - 3)) {
            const dist = (rule.sl_pct - Math.abs(rate)).toFixed(1);
            warnings.push({ type: "sl", icon: "🔴", msg: `${p.stock_name} 손절선 ${dist}% 남음 (현재 ${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%, 손절 -${rule.sl_pct}%)`, color: "#ff4444" });
          }
          // 보유일 초과 경고 — 스마트 매매 등록 종목
          if (rule && rule.buy_date && rule.max_hold_days > 0) {
            const holdDays = rule.hold_days || Math.floor((Date.now() - new Date(rule.buy_date).getTime()) / 86400000);
            if (holdDays >= rule.max_hold_days) {
              warnings.push({ type: "hold", icon: "⏰", msg: `${p.stock_name} 최대보유일 초과 (${holdDays}일 / ${rule.max_hold_days}일) — 만기매도 대상`, color: "#ff9800" });
            } else if (holdDays >= rule.max_hold_days - 3) {
              warnings.push({ type: "hold", icon: "⚠️", msg: `${p.stock_name} 만기매도 ${rule.max_hold_days - holdDays}일 남음 (${holdDays}일/${rule.max_hold_days}일)`, color: "#f59e0b" });
            }
          }
          // 추적손절 활성화 경고 — 수익 활성화 후 하락 중
          if (rule && rule.trailing_activated && rate > 0 && rule.peak_price > 0) {
            const dropFromPeak = ((p.current_price - rule.peak_price) / rule.peak_price * 100);
            if (dropFromPeak < -(rule.trailing_stop_pct - 2) && dropFromPeak > -rule.trailing_stop_pct) {
              warnings.push({ type: "trail", icon: "📉", msg: `${p.stock_name} 추적손절 임박 (고점 대비 ${dropFromPeak.toFixed(1)}%, 한도 -${rule.trailing_stop_pct}%)`, color: "#ff6b35" });
            }
          }
          // 스마트 매매 미등록 경고 — 보유 중이지만 전략 관리에 없는 종목 (자동 등록 진행 중)
          if (!rule) {
            warnings.push({ type: "unmanaged", icon: "🔄", msg: `${p.stock_name} 스마트 매매 자동 등록 중...`, color: "#90a4ae" });
          }
          // 과집중 경고 (단일 종목 40% 초과)
          const evalAmt = p.eval_amount || (p.current_price * p.qty);
          const weight = summary.total_eval > 0 ? (evalAmt / summary.total_eval * 100) : 0;
          if (weight > 40) {
            warnings.push({ type: "conc", icon: "⚡", msg: `${p.stock_name} 과집중 (비중 ${weight.toFixed(1)}% > 40%)`, color: "#f59e0b" });
          }
        });
        if (warnings.length === 0) return null;
        return (
          <div style={{ ...S.panel, padding: "8px 12px", background: "rgba(255,76,76,0.04)", border: "1px solid rgba(255,76,76,0.12)" }}>
            <div style={{ color: "#ff4444", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>⚠️ 위험관리 알림 ({warnings.length}건)</div>
            {warnings.map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11 }}>
                <span>{w.icon}</span>
                <span style={{ color: w.color }}>{w.msg}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ★ 스마트 전략 실행 패널 */}
      <div style={{ ...S.panel, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#e0e6f0", fontSize: 13, fontWeight: 600 }}>🧠 스마트 매매</span>
        <button onClick={runStrategyCheck} disabled={stratChecking}
          style={{ ...S.btn("#2196f3"), padding: "6px 14px", fontSize: 11, opacity: stratChecking ? 0.6 : 1 }}>
          {stratChecking ? "체크 중..." : "전략 체크 (트레일링/손절/익절)"}
        </button>
        <button onClick={runAutoInvest} disabled={autoInvesting}
          style={{ ...S.btn("#ff9800"), padding: "6px 14px", fontSize: 11, opacity: autoInvesting ? 0.6 : 1 }}>
          {autoInvesting ? "매수 중..." : "예비후보 자동 매수"}
        </button>
        {stratResult && (
          <span style={{ color: stratResult.error ? "#ff4444" : stratResult.signals_count > 0 ? "#4cff8b" : "#6688aa", fontSize: 11 }}>
            {stratResult.error ? `오류: ${stratResult.error}` :
              `체크 ${stratResult.checked || 0}건 / 신호 ${stratResult.signals_count || 0}건` +
              (stratResult.auto_buy?.action === "buy" ? ` → 자동매수: ${stratResult.auto_buy.stock_name} ${stratResult.auto_buy.qty}주` : "")}
          </span>
        )}
        {autoInvestResult && (
          <span style={{ color: autoInvestResult.action === "buy" ? "#4cff8b" : autoInvestResult.error ? "#ff4444" : "#6688aa", fontSize: 11 }}>
            {autoInvestResult.error ? `오류: ${autoInvestResult.error}` :
              autoInvestResult.action === "buy" ? `매수: ${autoInvestResult.stock_name} ${autoInvestResult.qty}주 (${fmt(autoInvestResult.total_amount)}원)` :
              autoInvestResult.reason || "실행 완료"}
          </span>
        )}
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 50px 50px 42px", padding: "6px 8px", fontSize: 10, color: "#6688aa", fontWeight: 600, borderBottom: "1px solid rgba(100,140,200,0.2)" }}>
                <span>종목</span><span style={{ textAlign: "right" }}>현재가</span><span style={{ textAlign: "center" }}>종합</span><span style={{ textAlign: "center" }}>진입</span><span style={{ textAlign: "center" }}>잔여</span>
              </div>
              {candidates.map((c, i) => {
                const daysLeft = c.expires_at ? Math.max(0, Math.ceil((new Date(c.expires_at) - new Date()) / 86400000)) : 0;
                const scoreColor = c.composite_score >= 80 ? "#ff4444" : c.composite_score >= 60 ? "#f59e0b" : "#6688aa";
                const chgClr = c.change_rate > 0 ? "#ff4444" : c.change_rate < 0 ? "#4488ff" : "#e0e6f0";
                return (
                  <div key={c.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 90px 50px 50px 42px",
                    padding: "7px 8px", fontSize: 12, alignItems: "center", cursor: "pointer",
                    borderBottom: i < candidates.length - 1 ? "1px solid rgba(100,140,200,0.08)" : "none",
                    background: candChartStock?.code === c.code ? "rgba(79,195,247,0.08)" : daysLeft <= 1 ? "rgba(220,38,38,0.05)" : "transparent",
                  }} onClick={() => openCandidateChart(c)}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 600, color: candChartStock?.code === c.code ? "#4fc3f7" : "#e0e6f0", textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3 }}>{c.name}</span>
                      <span style={{ color: "#556677", marginLeft: 4, fontSize: 10 }}>{c.code}</span>
                    </div>
                    <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                      <span style={{ color: chgClr }}>{c.current_price?.toLocaleString() || "-"}</span>
                      {c.change_rate != null && <div style={{ fontSize: 9, color: chgClr }}>{c.change_rate > 0 ? "+" : ""}{c.change_rate}%</div>}
                    </div>
                    <div style={{ textAlign: "center", color: scoreColor, fontWeight: 600 }}>{c.composite_score || "-"}</div>
                    <div style={{ textAlign: "center", color: "#6688aa" }}>{c.entry_score || "-"}</div>
                    <div style={{ textAlign: "center", color: daysLeft <= 1 ? "#ff4444" : "#6688aa", fontSize: 11 }}>D-{daysLeft}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ★ 예비후보 차트 (오른쪽 패널) */}
        {candChartStock && (
          <div style={{ ...S.panel, flex: "1 1 500px", minWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "#4fc3f7", fontSize: 13, fontWeight: 600 }}>📊 {candChartStock.name} ({candChartStock.code})</span>
              <button onClick={() => { setCandChartStock(null); setCandChartCandles(null); setCandQuoteData(null); }}
                style={{ background: "transparent", color: "#556677", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 6px" }}>✕</button>
            </div>
            {candChartLoading ? (
              <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,15,30,0.6)", borderRadius: 8 }}>
                <span style={{ color: "#6688aa", fontSize: 13 }}>📊 차트 로딩 중...</span>
              </div>
            ) : candChartCandles && candChartCandles.length > 0 ? (
              <>
                <StockChart candles={candChartCandles.slice(0, 100)} />
                {candQuoteData && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 8, background: "rgba(8,15,30,0.6)", borderRadius: 8, padding: 10 }}>
                    {[
                      ["현재가", fmt(candQuoteData.price), clr(candQuoteData.change)],
                      ["전일대비", `${candQuoteData.change >= 0 ? "+" : ""}${fmt(candQuoteData.change)}`, clr(candQuoteData.change)],
                      ["등락률", `${candQuoteData.change_rate >= 0 ? "+" : ""}${candQuoteData.change_rate}%`, clr(candQuoteData.change_rate)],
                      ["시가", fmt(candQuoteData.open), "#e0e6f0"],
                      ["고가", fmt(candQuoteData.high), "#ff4444"],
                      ["저가", fmt(candQuoteData.low), "#4488ff"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ textAlign: "center" }}>
                        <div style={{ color: "#556677", fontSize: 9 }}>{label}</div>
                        <div style={{ color, fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,15,30,0.6)", borderRadius: 8 }}>
                <span style={{ color: "#556677", fontSize: 12 }}>차트 데이터를 불러올 수 없습니다</span>
              </div>
            )}
          </div>
        )}

        {/* 보유종목 통합 패널 (테이블 + 차트) */}
        <div style={{ ...S.panel, flex: "1 1 600px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={S.title}>💼 보유종목 ({positions.length})</div>
            <button onClick={load} style={{ ...S.btn(), padding: "6px 12px", fontSize: 11 }}>새로고침</button>
          </div>
          {positions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>보유 종목 없음</div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                <thead>
                  <tr>{["종목", "수량", "매수금액", "평균가", "현재가", "당일", "손익", "수익률", "평가금액", "비중"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => {
                    const evalAmt = p.eval_amount || (p.current_price * p.qty);
                    const buyAmt = p.buy_amount || Math.round(p.avg_price * p.qty);
                    const weight = summary.total_eval > 0 ? (evalAmt / summary.total_eval * 100) : 0;
                    const dailyChg = p.prdy_ctrt || 0;
                    const rule = tradeRulesMap[p.stock_code];
                    const buyDate = rule?.buy_date;
                    const holdDays = buyDate ? Math.floor((Date.now() - new Date(buyDate).getTime()) / 86400000) : null;
                    return (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(100,140,200,0.08)", cursor: "pointer", background: chartStock?.stock_code === p.stock_code ? "rgba(79,195,247,0.08)" : "transparent" }}
                      onClick={() => openChart(p)}>
                      <td style={{ ...S.td, color: chartStock?.stock_code === p.stock_code ? "#4fc3f7" : "#e0e6f0", fontWeight: 600, textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3 }}>
                        {p.stock_name}
                        <div style={{ fontSize: 9, color: "#556677", fontWeight: 400 }}>
                          {p.stock_code}{holdDays !== null ? ` · ${holdDays}일` : ''}
                        </div>
                      </td>
                      <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(p.qty)}</td>
                      <td style={{ ...S.td, color: "#8899bb", fontFamily: "monospace", fontSize: 11 }}>{fmt(buyAmt)}</td>
                      <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(Math.round(p.avg_price))}</td>
                      <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(p.current_price)}</td>
                      <td style={{ ...S.td, color: clr(dailyChg), fontFamily: "monospace", fontSize: 11 }}>{dailyChg !== 0 ? `${dailyChg >= 0 ? '+' : ''}${dailyChg.toFixed(1)}%` : '-'}</td>
                      <td style={{ ...S.td, color: clr(p.profit_loss), fontFamily: "monospace", fontWeight: 600 }}>{fmtWon(p.profit_loss)}</td>
                      <td style={{ ...S.td, color: clr(p.profit_rate), fontFamily: "monospace", fontWeight: 600 }}>{fmtPct(p.profit_rate)}</td>
                      <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace", fontWeight: 600 }}>{fmt(evalAmt)}원</td>
                      <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 32, height: 5, borderRadius: 3, background: "rgba(100,140,200,0.15)", overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(weight, 100)}%`, height: "100%", background: weight > 30 ? "#f59e0b" : "#4fc3f7", borderRadius: 3 }} />
                          </div>
                          <span style={{ color: weight > 30 ? "#f59e0b" : "#8899bb" }}>{weight.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              {/* 종목 차트 영역 */}
              <div style={{ marginTop: 12, borderTop: "1px solid rgba(100,140,200,0.15)", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ color: "#8899bb", fontSize: 12, fontWeight: 600 }}>
                    📊 {chartStock ? `${chartStock.stock_name} (${chartStock.stock_code})` : "종목을 클릭하면 차트가 표시됩니다"}
                  </div>
                  {positions.length > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {positions.map((p, i) => (
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
                  <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,15,30,0.6)", borderRadius: 8 }}>
                    <span style={{ color: "#556677", fontSize: 12 }}>종목 행을 클릭하면 차트가 표시됩니다</span>
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
            </>
          )}
        </div>
      </div>

      {/* ★ 하단행: 목표 여정 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* 300만원 → 1천만원 여정 */}
        <div style={{ ...S.panel, flex: "1 1 400px" }}>
          <div style={S.title}>🎯 100만원 → 1천만원 여정</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
            {[
              ["시작금액", `${fmt(initCap)}원`, "#e0e6f0"],
              ["현재자산", `${fmt(totalAssets)}원`, "#4cff8b"],
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
  // ★ 후보종목 리스트
  const [candidates, setCandidates] = useState([]);
  const [candLoading, setCandLoading] = useState(true);
  // ★ 후보종목 차트
  const [chartCode, setChartCode] = useState(null);   // { code, name }
  const [chartCandles, setChartCandles] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  // ★ 호가 데이터
  const [askingData, setAskingData] = useState(null);
  const [askingLoading, setAskingLoading] = useState(false);

  const loadCandidates = useCallback(async () => {
    setCandLoading(true);
    try {
      const { data: cands } = await supabase.from('buy_candidates')
        .select('*').eq('status', 'active')
        .order('composite_score', { ascending: false }).limit(30);
      if (cands && cands.length > 0) {
        setCandidates(cands);
        // 실시간 가격 병렬 조회
        const prices = await Promise.all(
          cands.map(c => kisApi("quote", { code: c.code }).catch(() => null))
        );
        setCandidates(cands.map((c, i) => {
          const q = prices[i];
          return q?.success && q.price ? { ...c, current_price: q.price, change_rate: q.change_rate, change: q.change } : c;
        }));
      } else {
        setCandidates([]);
      }
    } catch (e) { console.error('후보 로드 실패:', e); }
    setCandLoading(false);
  }, []);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  // ★ 호가 조회
  const fetchAsking = async (code) => {
    const target = code || stockCode;
    if (target.length < 6) return;
    setAskingLoading(true);
    try {
      const r = await kisApi("asking", { code: target });
      if (r?.success) setAskingData(r);
    } catch (e) { console.error('호가 조회 실패:', e); }
    setAskingLoading(false);
  };

  const fetchQuote = async (code) => {
    const target = code || stockCode;
    if (target.length < 6) return;
    const r = await kisApi("quote", { code: target });
    if (r?.success) {
      setQuoteData(r);
      if (!price) setPrice(String(r.price));
    }
    // 호가도 동시 조회
    fetchAsking(target);
  };

  // ★ 후보종목 차트 열기
  const openCandChart = async (c) => {
    const code = c.code;
    const name = c.name;
    // 같은 종목이면 차트 토글 (닫기)
    if (chartCode?.code === code) { setChartCode(null); setChartCandles(null); return; }
    setChartCode({ code, name });
    setChartCandles(null);
    setChartLoading(true);
    try {
      const r = await kisApi("chart", { code, period: "D" });
      if (r?.success) setChartCandles(r.candles);
    } catch (e) { console.error('차트 로드 실패:', e); }
    setChartLoading(false);
  };

  // ★ 후보종목 클릭 → 종목코드 자동 입력 + 시세 + 호가 + 차트 자동 조회
  const selectCandidate = (c) => {
    setStockCode(c.code);
    setSide("buy");
    setQuoteData(null);
    setAskingData(null);
    setResult(null);
    fetchQuote(c.code);
    // 차트 자동 로드 (같은 종목이 아닐 때만)
    if (chartCode?.code !== c.code) {
      openCandChart(c);
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ★ 상단: 후보종목 + 주문폼 + 시세상세 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {/* ★ 후보종목 리스트 (좌측) */}
      <div style={{ ...S.panel, flex: "0 0 300px", minWidth: 280 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e0e6f0' }}>
            🎯 후보종목 <span style={{ color: "#6688aa", fontSize: 11, fontWeight: 400 }}>({candidates.length})</span>
          </div>
          <button onClick={loadCandidates} style={{ ...S.btn(), padding: "4px 8px", fontSize: 10 }}>새로고침</button>
        </div>
        {candLoading ? (
          <div style={{ textAlign: "center", padding: 30, color: "#6688aa", fontSize: 12 }}>로딩 중...</div>
        ) : candidates.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "#556677", fontSize: 12 }}>
            패턴탐지기에서<br/>후보를 등록하세요
          </div>
        ) : (
          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            {candidates.map((c, i) => {
              const daysLeft = c.expires_at ? Math.max(0, Math.ceil((new Date(c.expires_at) - new Date()) / 86400000)) : 0;
              const scoreColor = c.composite_score >= 80 ? "#ff4444" : c.composite_score >= 60 ? "#f59e0b" : "#6688aa";
              const isSelected = stockCode === c.code;
              const isCharting = chartCode?.code === c.code;
              return (
                <div key={c.id} style={{
                  padding: "8px 10px",
                  borderBottom: i < candidates.length - 1 ? "1px solid rgba(100,140,200,0.08)" : "none",
                  background: isSelected ? "rgba(100,181,246,0.15)" : isCharting ? "rgba(79,195,247,0.08)" : daysLeft <= 1 ? "rgba(220,38,38,0.05)" : "transparent",
                  borderLeft: isSelected ? "3px solid #64b5f6" : isCharting ? "3px solid #4fc3f7" : "3px solid transparent",
                  transition: "background 0.15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div onClick={() => selectCandidate(c)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "pointer" }}>
                      <span style={{ fontWeight: 600, color: "#e0e6f0", fontSize: 12 }}>{c.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ color: "#64b5f6", fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>{c.code}</span>
                      <button onClick={(e) => { e.stopPropagation(); openCandChart(c); }}
                        title="차트 보기"
                        style={{
                          background: isCharting ? "rgba(79,195,247,0.25)" : "rgba(30,40,60,0.5)",
                          border: isCharting ? "1px solid rgba(79,195,247,0.5)" : "1px solid rgba(100,140,200,0.15)",
                          borderRadius: 4, padding: "2px 5px", cursor: "pointer", fontSize: 11, lineHeight: 1,
                          color: isCharting ? "#4fc3f7" : "#6688aa",
                        }}>📊</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3, cursor: "pointer" }}
                    onClick={() => selectCandidate(c)}>
                    <span style={{ color: c.change_rate > 0 ? "#ff4444" : c.change_rate < 0 ? "#4488ff" : "#8899aa", fontSize: 10 }}>
                      {c.current_price?.toLocaleString() || "-"}원{c.change_rate != null && ` (${c.change_rate > 0 ? "+" : ""}${c.change_rate}%)`}
                    </span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ color: scoreColor, fontSize: 10, fontWeight: 600 }}>종합 {c.composite_score || "-"}</span>
                      <span style={{ color: "#6688aa", fontSize: 10 }}>진입 {c.entry_score || "-"}</span>
                      <span style={{ color: daysLeft <= 1 ? "#ff4444" : "#6688aa", fontSize: 10 }}>D-{daysLeft}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order Form (중앙) */}
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
              <button onClick={() => fetchQuote()} style={{ ...S.btn(), padding: "8px 14px", fontSize: 11 }}>조회</button>
            </div>
          </div>

          {quoteData && (
            <div style={{ padding: 10, background: "rgba(10,18,40,0.5)", borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: "#e0e6f0", fontWeight: 600 }}>{quoteData.name}</span>
              <span style={{ color: "#64b5f6", fontFamily: "monospace", fontSize: 10, marginLeft: 6 }}>{stockCode}</span>
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

      {/* ★ 호가창 (우측) - 좌우 2열 배치 */}
      <div style={{ ...S.panel, flex: "0 0 420px", minWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={S.title}>호가 (매도/매수){askingData && quoteData ? ` — ${quoteData.name}` : ''}</div>
          {stockCode && (
            <button onClick={() => fetchAsking()} disabled={askingLoading}
              style={{ ...S.btn(), padding: "3px 8px", fontSize: 10 }}>
              {askingLoading ? "..." : "새로고침"}
            </button>
          )}
        </div>
        {!askingData ? (
          <div style={{ textAlign: "center", padding: 40, color: "#556677", fontSize: 12 }}>
            {stockCode ? (askingLoading ? "호가 조회 중..." : "종목을 조회하면 호가가 표시됩니다") : "후보종목을 선택하세요"}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", gap: 12 }}>
              {/* 매도호가 (좌측) */}
              <div style={{ flex: 1 }}>
                <div style={{ color: "#4488ff", fontSize: 11, fontWeight: 600, marginBottom: 6, textAlign: "center" }}>매도호가</div>
                {[...askingData.asks].reverse().map((a, i) => a.price > 0 && (
                  <div key={`ask-${i}`} onClick={() => { setPrice(String(a.price)); setOrderType("00"); }}
                    style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", cursor: "pointer",
                      background: `rgba(68,136,255,${0.05 + (a.qty / (askingData.total_ask_qty || 1)) * 0.3})`,
                      borderRadius: 4, marginBottom: 2, transition: "background 0.1s",
                    }}>
                    <span style={{ color: "#4488ff", fontFamily: "monospace", fontSize: 12 }}>{fmt(a.price)}</span>
                    <span style={{ color: "#6688aa", fontFamily: "monospace", fontSize: 12 }}>{fmt(a.qty)}</span>
                  </div>
                ))}
              </div>
              {/* 매수호가 (우측) */}
              <div style={{ flex: 1 }}>
                <div style={{ color: "#ff4444", fontSize: 11, fontWeight: 600, marginBottom: 6, textAlign: "center" }}>매수호가</div>
                {askingData.bids.map((b, i) => b.price > 0 && (
                  <div key={`bid-${i}`} onClick={() => { setPrice(String(b.price)); setOrderType("00"); }}
                    style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", cursor: "pointer",
                      background: `rgba(255,68,68,${0.05 + (b.qty / (askingData.total_bid_qty || 1)) * 0.3})`,
                      borderRadius: 4, marginBottom: 2, transition: "background 0.1s",
                    }}>
                    <span style={{ color: "#ff4444", fontFamily: "monospace", fontSize: 12 }}>{fmt(b.price)}</span>
                    <span style={{ color: "#6688aa", fontFamily: "monospace", fontSize: 12 }}>{fmt(b.qty)}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* 총 잔량 요약 */}
            <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, padding: "6px 8px",
              borderTop: "1px solid rgba(100,140,200,0.1)", fontSize: 11 }}>
              <span style={{ color: "#4488ff" }}>총 매도잔량: {fmt(askingData.total_ask_qty)}</span>
              <span style={{ color: "#ff4444" }}>총 매수잔량: {fmt(askingData.total_bid_qty)}</span>
            </div>
          </div>
        )}
      </div>
      </div>{/* 상단 flex 닫기 */}

      {/* ★ 하단: 후보종목 차트 (기본 차트 스킬 사양) */}
      {chartCode && (() => {
        const cand = candidates.find(c => c.code === chartCode.code);
        const lastCandle = chartCandles && chartCandles.length > 0 ? chartCandles[0] : null;
        const prevCandle = chartCandles && chartCandles.length > 1 ? chartCandles[1] : null;
        const curP = lastCandle?.close || cand?.current_price || 0;
        const prevP = prevCandle?.close || curP;
        const chgPct = prevP > 0 ? ((curP - prevP) / prevP * 100) : 0;
        const chgColor = chgPct >= 0 ? '#FF0000' : '#0050FF';
        const highP = chartCandles ? Math.max(...chartCandles.map(c => c.high || 0)) : 0;
        const lowP = chartCandles ? Math.min(...chartCandles.filter(c => c.low > 0).map(c => c.low)) : 0;
        return (
        <div style={S.panel}>
          {/* 헤더: 기본 차트 스킬 형식 (📊 종목명 (코드) + 범례 7개) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              <span style={{ color: '#e0e6f0' }}>📊 {chartCode.name}</span>
              <span style={{ color: '#6688aa', fontSize: 11, marginLeft: 8 }}>({chartCode.code})</span>
              {curP > 0 && (
                <span style={{ color: chgColor, fontSize: 12, marginLeft: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                  {fmt(curP)}원 ({chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, alignItems: 'center', flexWrap: 'wrap' }}>
              <span><span style={{ color: '#FF0000' }}>■</span> 양봉</span>
              <span><span style={{ color: '#0050FF' }}>■</span> 음봉</span>
              <span style={{ color: '#ffcc00' }}>── MA5</span>
              <span style={{ color: '#ff6699' }}>── MA20</span>
              {/* 후보 종목 빠른 전환 */}
              {candidates.length > 1 && candidates.slice(0, 8).map((c) => (
                <button key={c.id} onClick={() => openCandChart(c)} style={{
                  background: chartCode?.code === c.code ? "rgba(79,195,247,0.2)" : "transparent",
                  color: chartCode?.code === c.code ? "#4fc3f7" : "#556677",
                  border: `1px solid ${chartCode?.code === c.code ? "rgba(79,195,247,0.3)" : "rgba(100,140,200,0.15)"}`,
                  borderRadius: 6, padding: "3px 8px", fontSize: 10, cursor: "pointer",
                }}>{c.name}</button>
              ))}
              <button onClick={() => { setChartCode(null); setChartCandles(null); }}
                style={{ background: "transparent", border: "1px solid rgba(255,76,76,0.3)", borderRadius: 6, padding: "3px 8px", fontSize: 10, cursor: "pointer", color: "#ff4c4c" }}>✕</button>
            </div>
          </div>

          {/* 차트 SVG */}
          {chartLoading ? (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,15,30,0.6)", borderRadius: 8 }}>
              <span style={{ color: "#6688aa", fontSize: 13 }}>📊 차트 로딩 중...</span>
            </div>
          ) : chartCandles && chartCandles.length > 0 ? (
            <StockChart candles={chartCandles.slice(0, 100)} />
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,15,30,0.6)", borderRadius: 8 }}>
              <span style={{ color: "#556677", fontSize: 12 }}>차트 데이터를 불러올 수 없습니다</span>
            </div>
          )}

          {/* 하단 정보 바 (기본 차트 스킬 사양) */}
          {curP > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '8px 14px',
              background: 'rgba(15,22,42,0.6)', borderRadius: 8, fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace', border: '1px solid rgba(50,70,100,0.2)', flexWrap: 'wrap', gap: 6,
            }}>
              <span><span style={{ color: '#556677' }}>현재가 </span><span style={{ color: chgColor }}>{fmt(curP)}</span></span>
              <span><span style={{ color: '#556677' }}>전일대비 </span><span style={{ color: chgColor }}>{chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%</span></span>
              <span><span style={{ color: '#556677' }}>고가 </span><span style={{ color: '#FF0000' }}>{fmt(highP)}</span></span>
              <span><span style={{ color: '#556677' }}>저가 </span><span style={{ color: '#0050FF' }}>{fmt(lowP)}</span></span>
              {cand?.composite_score != null && <span><span style={{ color: '#556677' }}>종합점수 </span><span style={{ color: cand.composite_score >= 80 ? '#ff4444' : cand.composite_score >= 60 ? '#f59e0b' : '#6688aa' }}>{cand.composite_score}</span></span>}
              {cand?.entry_score != null && <span><span style={{ color: '#556677' }}>진입점수 </span><span style={{ color: '#4fc3f7' }}>{cand.entry_score}</span></span>}
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}

// ============================================================
// Order History Panel (기간별 체결내역 + 실현손익)
// ============================================================
function OrderHistoryPanel() {
  const [orders, setOrders] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  // ★ 기간별 조회
  const todayStr = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [datePreset, setDatePreset] = useState("today");

  const applyPreset = (preset) => {
    setDatePreset(preset);
    const now = new Date(Date.now() + 9 * 3600000);
    const fmt2 = (d) => d.toISOString().slice(0, 10);
    const sd = new Date(now);
    if (preset === "today") { setStartDate(fmt2(now)); setEndDate(fmt2(now)); }
    else if (preset === "1week") { sd.setDate(sd.getDate() - 7); setStartDate(fmt2(sd)); setEndDate(fmt2(now)); }
    else if (preset === "1month") { sd.setMonth(sd.getMonth() - 1); setStartDate(fmt2(sd)); setEndDate(fmt2(now)); }
    else if (preset === "3month") { sd.setMonth(sd.getMonth() - 3); setStartDate(fmt2(sd)); setEndDate(fmt2(now)); }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    const sd = startDate.replace(/-/g, "");
    const ed = endDate.replace(/-/g, "");
    const [ordR, penR] = await Promise.all([
      kisApi("orders", { start_date: sd, end_date: ed }),
      kisApi("pending"),
    ]);
    if (ordR?.success) setOrders(ordR.orders || []);
    if (penR?.success) setPending(penR.pending || []);
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const cancelOrder = async (order) => {
    if (!confirm(`${order.stock_name} ${order.side} 주문을 취소하시겠습니까?`)) return;
    const r = await kisApi("order/cancel", {}, {
      method: "POST",
      body: { org_order_no: order.order_no, qty: order.remain_qty, price: order.order_price }
    });
    if (r?.success) loadAll();
    else alert("주문 취소 실패: " + (r?.message || ""));
  };

  // ★ 실현손익 계산: 매도 체결된 주문들의 손익 집계
  const sellOrders = orders.filter(o => o.side === "매도" && o.exec_qty > 0);
  const buyOrders = orders.filter(o => o.side === "매수" && o.exec_qty > 0);
  const totalSellAmt = sellOrders.reduce((s, o) => s + (o.exec_price * o.exec_qty), 0);
  const totalBuyAmt = buyOrders.reduce((s, o) => s + (o.exec_price * o.exec_qty), 0);

  const dateInputStyle = {
    background: "rgba(10,18,40,0.8)", color: "#e0e6f0", border: "1px solid rgba(100,140,200,0.2)",
    borderRadius: 6, padding: "5px 8px", fontSize: 11, fontFamily: "monospace",
  };

  const filters = [
    { id: "all", label: `전체 (${orders.length + pending.length})` },
    { id: "executed", label: `체결 (${orders.filter(o => o.exec_qty > 0).length})` },
    { id: "pending", label: `미체결 (${pending.length})` },
  ];

  return (
    <div style={S.panel}>
      {/* ★ 기간 선택 바 */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 10px", background: "rgba(10,18,40,0.5)", borderRadius: 8 }}>
        <span style={{ color: "#6688aa", fontSize: 11, fontWeight: 600 }}>📅 조회기간</span>
        {[["today","오늘"],["1week","1주"],["1month","1개월"],["3month","3개월"]].map(([k,l]) => (
          <button key={k} onClick={() => applyPreset(k)} style={{
            padding: "4px 10px", fontSize: 10, borderRadius: 5, cursor: "pointer",
            background: datePreset === k ? "rgba(100,180,246,0.2)" : "transparent",
            color: datePreset === k ? "#64b5f6" : "#6688aa",
            border: datePreset === k ? "1px solid rgba(100,180,246,0.3)" : "1px solid rgba(100,140,200,0.1)",
          }}>{l}</button>
        ))}
        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setDatePreset("custom"); }} style={dateInputStyle} />
        <span style={{ color: "#556677", fontSize: 11 }}>~</span>
        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setDatePreset("custom"); }} style={dateInputStyle} />
        <button onClick={loadAll} style={{ ...S.btn(), padding: "5px 12px", fontSize: 10 }}>조회</button>
      </div>

      {/* ★ 기간 체결 요약 */}
      {(sellOrders.length > 0 || buyOrders.length > 0) && (
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            ["매수", `${buyOrders.length}건`, `${fmt(totalBuyAmt)}원`, "#ff4444"],
            ["매도", `${sellOrders.length}건`, `${fmt(totalSellAmt)}원`, "#4488ff"],
            ["순매수", `${fmt(totalBuyAmt - totalSellAmt)}원`, "", clr(totalBuyAmt - totalSellAmt)],
          ].map(([l, v1, v2, c]) => (
            <div key={l} style={{ flex: 1, minWidth: 120, padding: "8px 12px", background: "rgba(10,18,40,0.5)", borderRadius: 8 }}>
              <div style={{ color: "#556677", fontSize: 10 }}>{l}</div>
              <div style={{ color: c, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{v1}</div>
              {v2 && <div style={{ color: "#8899bb", fontSize: 10, fontFamily: "monospace" }}>{v2}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.title}>주문내역</div>
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
        {loading && <span style={{ color: "#6688aa", fontSize: 11 }}>조회 중...</span>}
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
          {filter === "all" && orders.length > 0 && <div style={{ color: "#4cff8b", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>✅ 체결 주문</div>}
          {orders.length === 0 ? (
            !loading && <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>해당 기간 체결내역 없음 (KIS 서버 + 자동매매 기록 모두 없음)</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["날짜", "시간", "구분", "종목", "주문가", "수량", "체결가", "체결수량", "체결금액", "상태"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const execAmt = (o.exec_price || 0) * (o.exec_qty || 0);
                  const dateStr = o.order_date ? `${o.order_date.slice(4,6)}/${o.order_date.slice(6,8)}` : '';
                  const isAuto = o.source === "auto";
                  const statusText = isAuto ? (o.sell_reason || "자동매매") : (o.exec_qty > 0 ? "체결" : "미체결");
                  const statusColor = isAuto ? "#e040fb" : (o.exec_qty > 0 ? "#4cff8b" : "#ff9800");
                  return (
                  <tr key={i} style={{ background: isAuto ? "rgba(224,64,251,0.04)" : (i % 2 === 0 ? "rgba(10,18,40,0.3)" : "transparent") }}>
                    <td style={{ ...S.td, color: "#8899bb", fontFamily: "monospace", fontSize: 11 }}>{dateStr}</td>
                    <td style={{ ...S.td, color: "#6688aa", fontFamily: "monospace" }}>{o.order_time?.slice(0, 4) ? `${o.order_time.slice(0, 2)}:${o.order_time.slice(2, 4)}` : o.order_time}</td>
                    <td style={{ ...S.td, color: o.side === "매수" ? "#ff4444" : "#4488ff", fontWeight: 600 }}>{o.side}{isAuto ? " (자동)" : ""}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontWeight: 600 }}>{o.stock_name}{o.stock_code ? ` (${o.stock_code})` : ""}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.order_price)}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.order_qty)}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.exec_price)}</td>
                    <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(o.exec_qty)}</td>
                    <td style={{ ...S.td, color: o.side === "매도" ? "#4488ff" : "#ff4444", fontFamily: "monospace", fontWeight: 600 }}>{execAmt > 0 ? `${fmt(execAmt)}원` : '-'}</td>
                    <td style={{ ...S.td, color: statusColor, fontSize: 10 }}>{statusText}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {(orders.length === 0 && pending.length === 0 && !loading) && (
        <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>주문내역 없음</div>
      )}
    </div>
  );
}

// ============================================================
// Trade Log Panel (실현손익 + 자동매매 이력)
// ============================================================
function TradeLogPanel({ mode }) {
  const [logs, setLogs] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("autolog"); // "autolog" | "rules" | "stats"

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [logsR, rulesR] = await Promise.all([
        fetch(`${BACKEND_API}/api/kis/auto-trade/status`).then(r => r.json()).catch(() => ({})),
        fetch(`${BACKEND_API}/api/kis/auto-trade/rules?mode=${mode}`).then(r => r.json()).catch(() => ({ rules: [] })),
      ]);
      setLogs(logsR?.recent_logs || []);
      setRules(rulesR?.rules || []);
      setLoading(false);
    })();
  }, [mode]);

  // ★ 매도 완료 규칙들 (실현손익 내역)
  const soldRules = rules.filter(r => !r.enabled && r.buy_price > 0);
  // ★ 자동매매 로그에서 매도 기록 추출
  const sellLogs = logs.filter(l => l.status === "sell" || l.status === "sell_fail");
  const monitorLogs = logs.filter(l => l.status === "monitor");

  // ★ 규칙별 성과 통계
  const activeRules = rules.filter(r => r.enabled);
  const totalRules = rules.length;
  const sellSuccessLogs = logs.filter(l => l.status === "sell");
  const sellFailLogs = logs.filter(l => l.status === "sell_fail");

  if (loading) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#6688aa" }}>이력 조회 중...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 상단 통계 카드 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          ["📊", "전체 규칙", `${totalRules}건`, "#e0e6f0"],
          ["✅", "활성 규칙", `${activeRules.length}건`, "#4cff8b"],
          ["🏷️", "매도 완료", `${soldRules.length}건`, "#f59e0b"],
          ["📈", "매도 성공", `${sellSuccessLogs.length}건`, "#4488ff"],
          ["❌", "매도 실패", `${sellFailLogs.length}건`, "#ff4444"],
        ].map(([icon, label, val, c]) => (
          <div key={label} style={{ ...S.panel, flex: 1, minWidth: 120 }}>
            <div style={{ color: "#6688aa", fontSize: 10 }}>{icon} {label}</div>
            <div style={{ color: c, fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* 서브탭 */}
      <div style={S.panel}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[
            ["autolog", "🤖 자동매매 로그"],
            ["rules", "📒 매도 완료 내역"],
            ["stats", "📊 규칙별 현황"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)} style={{
              padding: "6px 14px", fontSize: 11, borderRadius: 6, cursor: "pointer",
              background: subTab === id ? "rgba(100,180,246,0.15)" : "transparent",
              color: subTab === id ? "#64b5f6" : "#6688aa",
              border: subTab === id ? "1px solid rgba(100,180,246,0.3)" : "1px solid rgba(100,140,200,0.1)",
            }}>{label}</button>
          ))}
        </div>

        {/* 자동매매 실행 로그 */}
        {subTab === "autolog" && (
          <>
            <div style={S.title}>🤖 최근 자동매매 실행 로그</div>
            {logs.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>실행 이력 없음</div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                {logs.map((log, i) => {
                  const isSell = log.status === "sell";
                  const isFail = log.status === "sell_fail";
                  const isError = log.status === "error";
                  const bgColor = isSell ? "rgba(76,255,139,0.05)" : isFail ? "rgba(255,76,76,0.05)" : isError ? "rgba(255,76,76,0.08)" : "transparent";
                  const borderColor = isSell ? "rgba(76,255,139,0.15)" : isFail ? "rgba(255,76,76,0.15)" : "rgba(100,140,200,0.08)";
                  const statusLabel = isSell ? "✅ 매도성공" : isFail ? "❌ 매도실패" : isError ? "⚠️ 오류" : log.status === "monitor" ? "👁️ 모니터링" : log.status === "skip" ? "⏭️ 스킵" : log.status;
                  const statusColor = isSell ? "#4cff8b" : isFail || isError ? "#ff4444" : "#6688aa";
                  const timeStr = log.executed_at ? new Date(log.executed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
                  return (
                    <div key={i} style={{ padding: "8px 10px", background: bgColor, borderBottom: `1px solid ${borderColor}`, borderRadius: i === 0 ? "6px 6px 0 0" : i === logs.length - 1 ? "0 0 6px 6px" : 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ color: statusColor, fontSize: 11, fontWeight: 600 }}>{statusLabel}</span>
                        <span style={{ color: "#556677", fontSize: 10, fontFamily: "monospace" }}>{timeStr}</span>
                      </div>
                      {log.error_detail && (
                        <div style={{ color: "#8899bb", fontSize: 10, lineHeight: 1.4, wordBreak: "break-all" }}>
                          {log.error_detail.length > 200 ? log.error_detail.slice(0, 200) + '...' : log.error_detail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 매도 완료 내역 (실현손익) */}
        {subTab === "rules" && (
          <>
            <div style={S.title}>📒 매도 완료 내역 (비활성화된 규칙)</div>
            {soldRules.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>매도 완료 내역 없음</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["종목", "전략", "매수가", "수량", "매수일", "익절%", "손절%", "상태"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {soldRules.map((r, i) => {
                    const stratLabel = r.strategy === "smart" ? "스마트" : "고정";
                    const dateStr = r.buy_date ? `${r.buy_date.slice(5, 7)}/${r.buy_date.slice(8, 10)}` : '-';
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(100,140,200,0.08)" }}>
                        <td style={{ ...S.td, color: "#e0e6f0", fontWeight: 600 }}>{r.stock_name || r.stock_code}</td>
                        <td style={{ ...S.td, color: r.strategy === "smart" ? "#f59e0b" : "#64b5f6", fontSize: 11 }}>{stratLabel}</td>
                        <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(Math.round(r.buy_price))}</td>
                        <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(r.quantity)}</td>
                        <td style={{ ...S.td, color: "#8899bb", fontFamily: "monospace", fontSize: 11 }}>{dateStr}</td>
                        <td style={{ ...S.td, color: "#4cff8b", fontFamily: "monospace" }}>{r.tp_pct}%</td>
                        <td style={{ ...S.td, color: "#ff4444", fontFamily: "monospace" }}>-{r.sl_pct}%</td>
                        <td style={{ ...S.td, color: "#f59e0b", fontSize: 11 }}>매도완료</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* 규칙별 현황 */}
        {subTab === "stats" && (
          <>
            <div style={S.title}>📊 자동매매 규칙별 현황</div>
            {rules.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>등록된 규칙 없음</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["종목", "전략", "매수가", "수량", "매수일", "보유일", "익절", "손절", "최고가", "상태"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rules.map((r, i) => {
                    const stratLabel = r.strategy === "smart" ? "🎯 스마트" : "📌 고정";
                    const holdDays = r.buy_date ? Math.floor((Date.now() - new Date(r.buy_date).getTime()) / 86400000) : 0;
                    const peakProfit = r.peak_price && r.buy_price ? ((r.peak_price - r.buy_price) / r.buy_price * 100) : 0;
                    const dateStr = r.buy_date ? `${r.buy_date.slice(5, 7)}/${r.buy_date.slice(8, 10)}` : '-';
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(100,140,200,0.08)", opacity: r.enabled ? 1 : 0.5 }}>
                        <td style={{ ...S.td, color: "#e0e6f0", fontWeight: 600 }}>{r.stock_name || r.stock_code}</td>
                        <td style={{ ...S.td, color: r.strategy === "smart" ? "#f59e0b" : "#64b5f6", fontSize: 11 }}>{stratLabel}</td>
                        <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(Math.round(r.buy_price))}</td>
                        <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(r.quantity)}</td>
                        <td style={{ ...S.td, color: "#8899bb", fontFamily: "monospace", fontSize: 11 }}>{dateStr}</td>
                        <td style={{ ...S.td, color: holdDays > (r.max_hold_days || 30) ? "#ff4444" : "#e0e6f0", fontFamily: "monospace" }}>{holdDays}일</td>
                        <td style={{ ...S.td, color: "#4cff8b", fontFamily: "monospace", fontSize: 11 }}>{r.tp_pct}%</td>
                        <td style={{ ...S.td, color: "#ff4444", fontFamily: "monospace", fontSize: 11 }}>-{r.sl_pct}%</td>
                        <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>
                          {r.peak_price > 0 ? (
                            <span style={{ color: peakProfit > 0 ? "#4cff8b" : "#ff4444" }}>{fmt(Math.round(r.peak_price))} ({peakProfit >= 0 ? '+' : ''}{peakProfit.toFixed(1)}%)</span>
                          ) : '-'}
                        </td>
                        <td style={{ ...S.td }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: r.enabled ? "rgba(76,255,139,0.1)" : "rgba(100,140,200,0.1)",
                            color: r.enabled ? "#4cff8b" : "#6688aa",
                          }}>{r.enabled ? "활성" : "비활성"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Quote Panel
// ============================================================
function StockSearchInput({ value, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSugg(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const searchByKeyword = async (keyword) => {
    try {
      const r = await fetch(`${BACKEND_API}/api/stock-search?keyword=${encodeURIComponent(keyword)}&limit=20`).then(r => r.json());
      return r.results || [];
    } catch { return []; }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(timerRef.current);
    const trimmed = v.trim();
    if (!trimmed) { setShowSugg(false); setSearching(false); return; }

    // 1차: 로컬 매핑에서 검색 (코드+이름 모두 지원)
    const local = localStockSearch(trimmed);
    if (local.length) {
      setSuggestions(local);
      setShowSugg(true);
      setSearching(false);
    } else {
      // 2차: 서버 검색 (KIS 마스터파일 기반)
      setSearching(true);
      setSuggestions([]);
      setShowSugg(true);
      timerRef.current = setTimeout(async () => {
        const results = await searchByKeyword(trimmed);
        setSuggestions(results);
        setShowSugg(true);
        setSearching(false);
      }, 300);
    }
  };

  const handleEnter = async () => {
    setShowSugg(false);
    const v = (value || "").trim();
    if (!v) return;
    // 숫자(종목코드)면 바로 조회
    if (/^\d{1,6}$/.test(v)) {
      // 드롭다운에 해당 코드가 있으면 이름 표시용으로 사용
      const match = suggestions.find(s => s.code === v);
      if (match) onChange(match.code);
      onSelect(v);
      return;
    }
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
      {showSugg && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "#1a2332", border: "1px solid rgba(100,140,200,0.2)", borderRadius: 6, maxHeight: 240, overflowY: "auto", marginTop: 2 }}>
          {searching && (
            <div style={{ padding: "10px 12px", color: "#6688aa", fontSize: 12, textAlign: "center" }}>
              검색 중...
            </div>
          )}
          {!searching && suggestions.length === 0 && (
            <div style={{ padding: "10px 12px", color: "#6688aa", fontSize: 12, textAlign: "center" }}>
              검색 결과 없음
            </div>
          )}
          {suggestions.map((s, i) => (
            <div key={i} onClick={() => { onChange(s.code); onSelect(s.code); setShowSugg(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid rgba(100,140,200,0.1)", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(100,181,246,0.1)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ color: "#e0e6f0" }}>{s.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {s.market && <span style={{ color: s.market === "KOSPI" ? "#4fc3f7" : "#ffb74d", fontSize: 10, fontWeight: 600 }}>{s.market}</span>}
                <span style={{ color: "#6688aa", fontFamily: "monospace" }}>{s.code}</span>
              </span>
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

  // KIS 재무정보 영문 키 → 한국어 컬럼명 매핑
  const COL_NAMES = {
    // 공통
    stac_yymm: '결산년월',
    // 손익계산서
    sale_account: '매출액', sale_cost: '매출원가', sale_totl_prfi: '매출총이익',
    depr_cost: '감가상각비', sell_mang: '판관비', bsop_prti: '영업이익',
    bsop_non_ernn: '영업외수익', thtr_ntin: '당기순이익',
    // 성장성비율
    grs: '매출성장률', bsop_prfi_inrt: '영업이익증가율',
    equt_inrt: '자기자본증가율', totl_aset_inrt: '총자산증가율',
    // 재무비율
    bsop_prfi_rate: '영업이익률', ntin_rate: '순이익률',
    roe_val: 'ROE', eps: 'EPS', bps: 'BPS', per: 'PER', pbr: 'PBR',
    debt_rate: '부채비율', rsrv_rate: '유보율', crnt_rate: '유동비율',
  };
  const toKr = (key) => COL_NAMES[key] || key;

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
                  <tr>{Object.keys(data.financial_ratio[0] || {}).slice(0, 8).map(k => <th key={k} style={{ ...S.th, fontSize: 10 }}>{toKr(k)}</th>)}</tr>
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
                  <tr>{Object.keys(data.income_statement[0] || {}).slice(0, 8).map(k => <th key={k} style={{ ...S.th, fontSize: 10 }}>{toKr(k)}</th>)}</tr>
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
                  <tr>{Object.keys(data.growth_ratio[0] || {}).slice(0, 8).map(k => <th key={k} style={{ ...S.th, fontSize: 10 }}>{toKr(k)}</th>)}</tr>
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
// Auto Trade Panel (스마트 매매 모니터링)
// ============================================================

function AutoTradePanel({ mode = "virtual" }) {
  const [monitoring, setMonitoring] = useState(false);
  const [logs, setLogs] = useState([]);
  const [positions, setPositions] = useState([]);
  const intervalRef = useRef(null);
  const checkRef = useRef(null);
  const [intervalSec, setIntervalSec] = useState(30);

  // 서버 로그 관련 상태
  const [logTab, setLogTab] = useState("client"); // "client" | "server"
  const [serverLogs, setServerLogs] = useState([]);
  const [serverLogLoading, setServerLogLoading] = useState(false);

  // 서버 로그 조회
  const loadServerLogs = useCallback(async () => {
    setServerLogLoading(true);
    try {
      const activeMode = getKisActiveMode();
      const accountType = activeMode === "real" ? "real" : "virtual";
      const r = await fetch(`${BACKEND_API}/api/kis/server-logs?account_type=${accountType}&limit=100`);
      const data = await r.json();
      if (data?.logs) setServerLogs(data.logs);
    } catch (e) {
      console.error("서버 로그 조회 실패:", e);
    } finally {
      setServerLogLoading(false);
    }
  }, []);

  // 로그 추가
  const addLog = useCallback((msg) => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString('ko-KR'), msg }, ...prev].slice(0, 50));
  }, []);

  // 잔고 조회
  const loadPositions = useCallback(async () => {
    const r = await kisApi("balance");
    if (r?.success && r.positions) setPositions(r.positions);
  }, []);

  // 스마트 매매 체크 1회 실행 (서버 API 호출)
  const checkAndExecute = useCallback(async () => {
    addLog("스마트 매매 체크 중...");
    try {
      const activeMode = getKisActiveMode();
      const accountType = activeMode === "real" ? "real" : "virtual";
      const r = await fetch(`${BACKEND_API}/api/kis/strategy/check?account_type=${accountType}&auto_sell=true`, { method: "POST" });
      const data = await r.json();
      if (data?.error) {
        addLog(`❌ 체크 실패: ${data.error}`);
        return;
      }
      const checked = data.checked || 0;
      const signals = data.signals_count || 0;
      if (signals > 0) {
        addLog(`🔔 체크 ${checked}건 / 매도 신호 ${signals}건`);
        // 매도 결과 표시
        (data.results || []).forEach(r => {
          if (r.signal && r.signal !== "HOLD") {
            const icon = r.sell_success ? "✅" : r.signal?.includes("SELL") ? "🔔" : "";
            addLog(`  ${icon} ${r.stock_name}(${r.stock_code}) [${r.signal}] 수익률 ${r.profit_pct >= 0 ? "+" : ""}${r.profit_pct?.toFixed(2)}%`);
          }
        });
      } else {
        // 각 종목 상태 간략 표시
        (data.results || []).forEach(r => {
          addLog(`  ${r.stock_name}(${r.stock_code}) [스마트] 수익률 ${r.profit_pct >= 0 ? "+" : ""}${r.profit_pct?.toFixed(2)}% → 유지`);
        });
      }
      addLog("체크 완료");
      if (signals > 0) await loadPositions();
    } catch (e) {
      addLog(`❌ 체크 오류: ${e.message}`);
    }
  }, [addLog, loadPositions]);

  // checkRef 항상 최신 유지
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

  // 마운트 시 자동 초기화
  const autoInitRef = useRef(false);
  useEffect(() => {
    if (autoInitRef.current) return;
    autoInitRef.current = true;

    // 백그라운드 글로벌 모니터 인계
    if (isKisAutoTradeRunning(mode)) {
      stopKisAutoTrade(mode);
      const bgLogs = getKisAutoTradeLogs(mode);
      if (bgLogs.length > 0) setLogs(bgLogs);
    }

    (async () => {
      const balR = await kisApi("balance");
      if (balR?.success && balR.positions) setPositions(balR.positions);

      // 30초 간격 자동 모니터링 시작
      setIntervalSec(30);
      setMonitoring(true);
      addLog(`▶️ 자동 모니터링 시작 (30초 간격)`);
      setTimeout(() => {
        checkRef.current?.();
        intervalRef.current = setInterval(() => checkRef.current?.(), 30 * 1000);
      }, 500);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 종목 차트 모달 ──
  const [chartStock, setChartStock] = useState(null);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 상태 + 시작/정지 */}
      <div style={{ ...S.panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e0e6f0', marginBottom: 4 }}>
            🧠 스마트 매매 모니터링
          </div>
          <div style={{ fontSize: 11, color: '#6688aa' }}>
            대시보드 스마트 매매로 등록된 종목을 주기적으로 체크 · 트레일링/손절/만기 자동 매도
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

      {/* 실행 로그 (클라이언트/서버 탭) */}
      <div style={S.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setLogTab("client")} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: logTab === "client" ? 'rgba(100,140,200,0.3)' : 'transparent',
              color: logTab === "client" ? '#e0e6f0' : '#556677',
            }}>
              브라우저 로그 {monitoring && <span style={{ color: '#4cff8b', fontSize: 10 }}>●</span>}
            </button>
            <button onClick={() => { setLogTab("server"); loadServerLogs(); }} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: logTab === "server" ? 'rgba(0,200,120,0.2)' : 'transparent',
              color: logTab === "server" ? '#00c878' : '#556677',
            }}>
              서버 로그 (Railway)
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {logTab === "server" && (
              <button onClick={loadServerLogs} style={{ ...S.btn('#1a3a2e', '#1a5a3e'), padding: '4px 10px', fontSize: 10 }}>
                {serverLogLoading ? '로딩...' : '새로고침'}
              </button>
            )}
            {logTab === "client" && (
              <button onClick={() => setLogs([])} style={{ ...S.btn('#333', '#444'), padding: '4px 10px', fontSize: 10 }}>지우기</button>
            )}
          </div>
        </div>
        <div style={{
          maxHeight: 300, overflowY: 'auto', background: 'rgba(10,18,40,0.6)', borderRadius: 8, padding: 10,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        }}>
          {logTab === "client" ? (
            /* 브라우저 로그 */
            logs.length === 0
              ? <div style={{ color: '#556677', textAlign: 'center', padding: 20 }}>모니터링을 시작하면 로그가 표시됩니다</div>
              : logs.map((l, i) => (
                <div key={i} style={{ color: l.msg.includes('✅') ? '#4cff8b' : l.msg.includes('❌') ? '#ff4c4c' : l.msg.includes('🔔') ? '#ffd54f' : '#8899aa', marginBottom: 2 }}>
                  <span style={{ color: '#556677' }}>[{l.time}]</span> {l.msg}
                </div>
              ))
          ) : (
            /* 서버 로그 */
            serverLogLoading
              ? <div style={{ color: '#556677', textAlign: 'center', padding: 20 }}>서버 로그 조회 중...</div>
              : serverLogs.length === 0
                ? <div style={{ color: '#556677', textAlign: 'center', padding: 20 }}>
                    서버 로그가 없습니다. 장중(월-금 9시~15시)에 10분 간격으로 서버가 자동 체크하며 로그가 기록됩니다.
                  </div>
                : serverLogs.map((log, i) => {
                    const time = new Date(log.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const typeColors = {
                      scheduler: '#7b93db', check: '#8899aa', sell: '#4cff8b',
                      buy: '#ffd54f', error: '#ff4c4c', warning: '#ffaa33', info: '#6688aa',
                    };
                    const typeLabels = {
                      scheduler: '⏰', check: '🔍', sell: '✅', buy: '🛒',
                      error: '❌', warning: '⚠️', info: 'ℹ️',
                    };
                    const color = typeColors[log.log_type] || '#8899aa';
                    const icon = typeLabels[log.log_type] || '📋';
                    return (
                      <div key={log.id || i} style={{ color, marginBottom: 3, lineHeight: 1.5 }}>
                        <span style={{ color: '#556677' }}>[{time}]</span>{' '}
                        <span style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, background: `${color}22`, color, fontWeight: 600 }}>
                          {icon} {log.log_type}
                        </span>{' '}
                        <span style={{ color: log.account_type === 'real' ? '#ff6b6b' : '#4a9' , fontSize: 9, fontWeight: 600 }}>
                          [{log.account_type === 'real' ? '실전' : '모의'}]
                        </span>{' '}
                        {log.message}
                        {log.details && log.details.profit_pct !== undefined && (
                          <span style={{ color: log.details.profit_pct >= 0 ? '#4cff8b' : '#ff4c4c', marginLeft: 4 }}>
                            ({log.details.profit_pct >= 0 ? '+' : ''}{log.details.profit_pct}%)
                          </span>
                        )}
                      </div>
                    );
                  })
          )}
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
