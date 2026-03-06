import { useState, useEffect, useCallback, useRef } from "react";

// KIS credentials: in-memory cache + localStorage backup
// 모의투자/실전투자 각각 별도 저장
const KIS_STORAGE_KEY = "kis_credentials";
const KIS_VIRTUAL_KEY = "kis_credentials_virtual";
const KIS_REAL_KEY = "kis_credentials_real";
const KIS_ACTIVE_MODE_KEY = "kis_active_mode"; // 'virtual' | 'real'
let _kisCache = {};

export function getKisCredentials(mode) {
  // mode가 지정되면 해당 모드의 크레덴셜 반환
  if (mode === 'virtual' || mode === 'real') {
    try {
      const key = mode === 'virtual' ? KIS_VIRTUAL_KEY : KIS_REAL_KEY;
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch { return {}; }
  }
  // mode 미지정: 현재 활성 모드의 크레덴셜 반환
  if (_kisCache.access_token) return _kisCache;
  try {
    const stored = JSON.parse(localStorage.getItem(KIS_STORAGE_KEY) || "{}");
    if (stored.access_token) _kisCache = stored;
    return stored;
  } catch { return _kisCache; }
}

export function getKisActiveMode() {
  try { return localStorage.getItem(KIS_ACTIVE_MODE_KEY) || 'virtual'; } catch { return 'virtual'; }
}

function saveKisCredentials(creds) {
  _kisCache = creds;
  try { localStorage.setItem(KIS_STORAGE_KEY, JSON.stringify(creds)); } catch {}
  // 모드별로도 저장
  const modeKey = creds.is_virtual !== false ? KIS_VIRTUAL_KEY : KIS_REAL_KEY;
  try { localStorage.setItem(modeKey, JSON.stringify(creds)); } catch {}
  try { localStorage.setItem(KIS_ACTIVE_MODE_KEY, creds.is_virtual !== false ? 'virtual' : 'real'); } catch {}
}

// 특정 모드의 크레덴셜을 활성화
export function activateKisMode(mode) {
  const creds = getKisCredentials(mode);
  // is_virtual 플래그를 모드에 맞게 강제 설정 (누락 방지)
  creds.is_virtual = mode === 'virtual';
  // 항상 해당 모드의 크레덴셜로 전환 (토큰 없어도 모드 전환)
  _kisCache = creds;
  try { localStorage.setItem(KIS_STORAGE_KEY, JSON.stringify(creds)); } catch {}
  try { localStorage.setItem(KIS_ACTIVE_MODE_KEY, mode); } catch {}
  return !!creds.access_token;
}

// 토큰 자동 갱신 (app_key/app_secret이 저장되어 있으면 새 토큰 발급)
export async function refreshKisToken(mode) {
  const creds = getKisCredentials(mode);
  if (!creds.app_key || !creds.app_secret || !creds.account_no) return false;
  try {
    const isV = mode === 'virtual';
    const r = await kisApi("config", {}, {
      method: "POST",
      body: JSON.stringify({ app_key: creds.app_key, app_secret: creds.app_secret, account_no: creds.account_no, is_virtual: isV }),
    });
    if (r?.success && r.access_token) {
      const updated = { ...creds, access_token: r.access_token, is_virtual: isV };
      _kisCache = updated;
      try { localStorage.setItem(KIS_STORAGE_KEY, JSON.stringify(updated)); } catch {}
      const modeKey = isV ? KIS_VIRTUAL_KEY : KIS_REAL_KEY;
      try { localStorage.setItem(modeKey, JSON.stringify(updated)); } catch {}
      try { localStorage.setItem(KIS_ACTIVE_MODE_KEY, mode); } catch {}
      console.log(`[KIS] Token refreshed for ${mode} mode`);
      return true;
    }
  } catch (e) { console.warn("[KIS] Token refresh failed:", e.message); }
  return false;
}

export async function kisApi(route, params = {}, options = {}) {
  try {
    const creds = getKisCredentials();
    // is_virtual이 undefined이면 활성 모드에서 결정
    const activeMode = getKisActiveMode();
    const isVirtual = creds.is_virtual !== undefined ? creds.is_virtual : (activeMode === 'virtual');
    console.log("[KIS]", route, "mode:", isVirtual ? "virtual" : "REAL", "token:", creds.access_token ? "yes" : "NO", "appkey:", creds.app_key ? "yes" : "NO");
    const url = new URL("/api/kis", window.location.origin);
    // Route + credentials + extra params all as query string
    url.searchParams.set("_route", route);
    if (creds.app_key) url.searchParams.set("_ak", creds.app_key);
    if (creds.app_secret) url.searchParams.set("_as", creds.app_secret);
    if (creds.account_no) url.searchParams.set("_acct", creds.account_no);
    // 항상 _virt 플래그 전송 (누락 시 백엔드가 모의투자로 기본 처리하는 문제 방지)
    url.searchParams.set("_virt", String(isVirtual));
    if (creds.access_token) url.searchParams.set("_token", creds.access_token);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v); });

    // Also send credentials via headers as backup
    const headers = {
      "Content-Type": "application/json",
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
// KIS Trading Component
// ============================================================
export default function KisTrading({ mode = "virtual" }) {
  const isVirtual = mode === "virtual";
  const [tab, setTab] = useState("config");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load KIS status from localStorage for the given mode + auto-refresh token
  useEffect(() => {
    activateKisMode(mode);
    const creds = getKisCredentials(mode);
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

    // 크레덴셜이 있지만 토큰이 없거나 만료되었을 수 있으면 자동 갱신
    if (configured && !tokenValid) {
      refreshKisToken(mode).then(ok => {
        if (ok) updateStatus(getKisCredentials(mode));
      });
    }
    // 토큰이 있어도 페이지 진입 시 갱신 시도 (만료 방지)
    else if (configured && tokenValid) {
      setTab("balance");
      refreshKisToken(mode).then(ok => {
        if (ok) updateStatus(getKisCredentials(mode));
      });
    }
  }, [mode]);

  const tabs = [
    { id: "config", label: "API 설정", icon: "🔑" },
    { id: "balance", label: "잔고", icon: "💰" },
    { id: "order", label: "주문", icon: "📝" },
    { id: "orders", label: "체결내역", icon: "📋" },
    { id: "quote", label: "시세조회", icon: "📈" },
    { id: "asking", label: "호가", icon: "📊" },
    { id: "finance", label: "재무정보", icon: "📑" },
  ];

  // 렌더 직전 항상 해당 모드 크레덴셜 활성화 (하위 패널이 올바른 데이터 사용)
  activateKisMode(mode);

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
      {tab === "config" && <ConfigPanel mode={mode} onConnect={() => {
        activateKisMode(mode);
        const creds = getKisCredentials(mode);
        setStatus({ configured: true, token_valid: !!creds.access_token, is_virtual: isVirtual, account_no: creds.account_no ? creds.account_no.replace(/-/g, "").slice(0, 4) + "****" + creds.account_no.replace(/-/g, "").slice(-2) : "" });
      }} />}
      {tab === "balance" && <BalancePanel key={mode} />}
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
  const saved = getKisCredentials(mode);
  const isV = mode === 'virtual';
  const [appKey, setAppKey] = useState(saved.app_key || "");
  const [appSecret, setAppSecret] = useState(saved.app_secret || "");
  const [acctNo, setAcctNo] = useState(saved.account_no || "");
  const [hasToken, setHasToken] = useState(!!saved.access_token);
  const [result, setResult] = useState(null);
  const [connecting, setConnecting] = useState(false);

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
      saveKisCredentials({ app_key: appKey, app_secret: appSecret, account_no: acctNo, is_virtual: isV, access_token: r.access_token });
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
// Balance Panel
// ============================================================
function BalancePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await kisApi("balance");
    setData(r);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#6688aa" }}>잔고 조회 중...</div>;
  if (!data?.success) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#ff9800" }}>잔고 조회 실패 - KIS API 설정을 확인하세요</div>;

  const { positions, summary } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Summary Cards */}
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

      {/* Holdings Table */}
      <div style={S.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={S.title}>보유종목 ({positions.length})</div>
          <button onClick={load} style={{ ...S.btn(), padding: "6px 14px", fontSize: 11 }}>새로고침</button>
        </div>
        {positions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>보유 종목 없음</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["종목", "코드", "수량", "평균단가", "현재가", "평가금액", "손익", "수익률"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "rgba(10,18,40,0.3)" : "transparent" }}>
                  <td style={{ ...S.td, color: "#e0e6f0", fontWeight: 600 }}>{p.stock_name}</td>
                  <td style={{ ...S.td, color: "#6688aa", fontFamily: "monospace" }}>{p.stock_code}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(p.qty)}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(Math.round(p.avg_price))}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(p.current_price)}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(p.eval_amount)}</td>
                  <td style={{ ...S.td, color: clr(p.profit_loss), fontFamily: "monospace", fontWeight: 600 }}>{fmtWon(p.profit_loss)}</td>
                  <td style={{ ...S.td, color: clr(p.profit_rate), fontFamily: "monospace", fontWeight: 600 }}>{fmtPct(p.profit_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await kisApi("orders");
      if (r?.success) setOrders(r.orders);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#6688aa" }}>체결내역 조회 중...</div>;

  return (
    <div style={S.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={S.title}>오늘의 체결내역</div>
        <button onClick={async () => { setLoading(true); const r = await kisApi("orders"); if (r?.success) setOrders(r.orders); setLoading(false); }}
          style={{ ...S.btn(), padding: "6px 14px", fontSize: 11 }}>새로고침</button>
      </div>
      {orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: "#6688aa" }}>체결내역 없음</div>
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
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* Price Info - compact */}
            <div style={{ minWidth: 220, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: "#e0e6f0" }}>{quote.name}</span>
                <span style={{ fontSize: 11, color: "#6688aa" }}>{quote.stock_code}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: clr(quote.change), fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.2 }}>
                {fmt(quote.price)}<span style={{ fontSize: 13, color: "#6688aa" }}>원</span>
              </div>
              <div style={{ color: clr(quote.change), fontSize: 13, fontFamily: "monospace", marginTop: 2, marginBottom: 10 }}>
                {quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : "—"} {fmt(Math.abs(quote.change))}원 ({fmtPct(quote.change_rate)})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[["시가", quote.open], ["고가", quote.high], ["저가", quote.low], ["거래량", quote.volume], ["PER", quote.per?.toFixed(1)], ["PBR", quote.pbr?.toFixed(2)]].map(([l, v]) => (
                  <div key={l}><div style={{ color: "#556677", fontSize: 9 }}>{l}</div><div style={{ color: "#e0e6f0", fontSize: 12, fontFamily: "monospace" }}>{typeof v === "number" ? fmt(v) : v || "—"}</div></div>
                ))}
              </div>
            </div>

            {/* Chart - fills remaining space */}
            {chartData && chartData.length > 0 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#6688aa", marginBottom: 4 }}>
                  {{ D: "일봉", W: "주봉", M: "월봉" }[period]} ({chartData.length}개)
                </div>
                <MiniCandleChart candles={chartData.slice(0, 100)} width={580} height={220} />
              </div>
            )}
          </div>
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
function MiniCandleChart({ candles, width = 600, height = 250 }) {
  if (!candles || candles.length === 0) return null;

  const dc = candles.slice().reverse();
  const prices = dc.flatMap(c => [c.high, c.low]);
  const mn = Math.min(...prices), mx = Math.max(...prices);
  const rg = mx - mn || 1;
  const cw = (width - 50) / dc.length;
  const toY = (p) => 20 + (1 - (p - mn) / rg) * (height - 50);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <rect x="0" y="0" width={width} height={height} fill="rgba(8,15,30,0.8)" rx="4" />
      {[0.25, 0.5, 0.75].map(p => (
        <g key={p}>
          <line x1="40" y1={toY(mn + rg * p)} x2={width - 10} y2={toY(mn + rg * p)} stroke="rgba(50,70,100,0.3)" strokeDasharray="3,3" />
          <text x="2" y={toY(mn + rg * p) + 4} fill="#445566" fontSize="9" fontFamily="monospace">{fmt(Math.round(mn + rg * p))}</text>
        </g>
      ))}
      {dc.map((c, i) => {
        const x = 45 + i * cw;
        const up = c.close >= c.open;
        const co = up ? "#ff4444" : "#4488ff";
        const bt = toY(Math.max(c.open, c.close));
        const bb = toY(Math.min(c.open, c.close));
        const bh = Math.max(bb - bt, 1);
        return (
          <g key={i}>
            <line x1={x + cw / 2} y1={toY(c.high)} x2={x + cw / 2} y2={toY(c.low)} stroke={co} strokeWidth="1" />
            <rect x={x + 1} y={bt} width={Math.max(cw - 2, 1)} height={bh} fill={co} rx="1" />
          </g>
        );
      })}
    </svg>
  );
}
