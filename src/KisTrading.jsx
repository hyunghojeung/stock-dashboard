import { useState, useEffect, useCallback, useRef } from "react";

// KIS credentials: in-memory cache + localStorage backup
const KIS_STORAGE_KEY = "kis_credentials";
let _kisCache = {};

function getKisCredentials() {
  // In-memory cache takes priority
  if (_kisCache.access_token) return _kisCache;
  try {
    const stored = JSON.parse(localStorage.getItem(KIS_STORAGE_KEY) || "{}");
    if (stored.access_token) _kisCache = stored;
    return stored;
  } catch { return _kisCache; }
}

function saveKisCredentials(creds) {
  _kisCache = creds;
  try { localStorage.setItem(KIS_STORAGE_KEY, JSON.stringify(creds)); } catch {}
}

async function kisApi(route, params = {}, options = {}) {
  try {
    const creds = getKisCredentials();
    console.log("[KIS]", route, "token:", creds.access_token ? "yes" : "NO", "appkey:", creds.app_key ? "yes" : "NO", "creds_keys:", Object.keys(creds));
    const url = new URL("/api/kis", window.location.origin);
    // Route + credentials + extra params all as query string
    url.searchParams.set("_route", route);
    if (creds.app_key) url.searchParams.set("_ak", creds.app_key);
    if (creds.app_secret) url.searchParams.set("_as", creds.app_secret);
    if (creds.account_no) url.searchParams.set("_acct", creds.account_no);
    if (creds.is_virtual !== undefined) url.searchParams.set("_virt", String(creds.is_virtual));
    if (creds.access_token) url.searchParams.set("_token", creds.access_token);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v); });

    // Also send credentials via headers as backup
    const headers = {
      "Content-Type": "application/json",
      ...(creds.app_key && { "x-kis-appkey": creds.app_key }),
      ...(creds.app_secret && { "x-kis-appsecret": creds.app_secret }),
      ...(creds.account_no && { "x-kis-account": creds.account_no }),
      ...(creds.is_virtual !== undefined && { "x-kis-virtual": String(creds.is_virtual) }),
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
export default function KisTrading() {
  const [tab, setTab] = useState("config");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load KIS status from localStorage
  useEffect(() => {
    const creds = getKisCredentials();
    const configured = !!(creds.app_key && creds.app_secret && creds.account_no);
    const tokenValid = !!creds.access_token;
    const s = {
      configured,
      token_valid: tokenValid,
      is_virtual: creds.is_virtual !== false,
      account_no: creds.account_no ? creds.account_no.replace(/-/g, "").slice(0, 4) + "****" + creds.account_no.replace(/-/g, "").slice(-2) : "",
    };
    setStatus(s);
    setLoading(false);
    if (configured && tokenValid) setTab("balance");
  }, []);

  const tabs = [
    { id: "config", label: "API 설정", icon: "🔑" },
    { id: "balance", label: "잔고", icon: "💰" },
    { id: "order", label: "주문", icon: "📝" },
    { id: "orders", label: "체결내역", icon: "📋" },
    { id: "quote", label: "시세조회", icon: "📈" },
    { id: "asking", label: "호가", icon: "📊" },
    { id: "finance", label: "재무정보", icon: "📑" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status Bar */}
      <div style={{ ...S.panel, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>🏦</span>
          <span style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15 }}>KIS 모의투자</span>
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
      {tab === "config" && <ConfigPanel onConnect={() => {
        const creds = getKisCredentials();
        setStatus({ configured: true, token_valid: !!creds.access_token, is_virtual: creds.is_virtual !== false, account_no: creds.account_no ? creds.account_no.replace(/-/g, "").slice(0, 4) + "****" + creds.account_no.replace(/-/g, "").slice(-2) : "" });
      }} />}
      {tab === "balance" && <BalancePanel />}
      {tab === "order" && <OrderPanel />}
      {tab === "orders" && <OrderHistoryPanel />}
      {tab === "quote" && <QuotePanel />}
      {tab === "asking" && <AskingPanel />}
      {tab === "finance" && <FinancePanel />}
    </div>
  );
}

// ============================================================
// Config Panel
// ============================================================
function ConfigPanel({ onConnect }) {
  const saved = getKisCredentials();
  const [appKey, setAppKey] = useState(saved.app_key || "");
  const [appSecret, setAppSecret] = useState(saved.app_secret || "");
  const [accountNo, setAccountNo] = useState(saved.account_no || "");
  const [isVirtual, setIsVirtual] = useState(saved.is_virtual !== false);
  const [result, setResult] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const connect = async () => {
    setConnecting(true);
    setResult(null);
    const r = await kisApi("config", {}, {
      method: "POST",
      body: JSON.stringify({ app_key: appKey, app_secret: appSecret, account_no: accountNo, is_virtual: isVirtual }),
    });
    setResult(r);
    setConnecting(false);
    if (r?.success && r.access_token) {
      saveKisCredentials({ app_key: appKey, app_secret: appSecret, account_no: accountNo, is_virtual: isVirtual, access_token: r.access_token });
      onConnect?.();
    }
  };

  return (
    <div style={S.panel}>
      <div style={S.title}>KIS Open API 설정</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={S.label}>App Key</label>
          <input style={S.input} value={appKey} onChange={e => setAppKey(e.target.value)} placeholder="발급받은 앱키" />
        </div>
        <div>
          <label style={S.label}>App Secret</label>
          <input style={{ ...S.input }} type="password" value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder="발급받은 앱시크릿" />
        </div>
        <div>
          <label style={S.label}>계좌번호 (10자리)</label>
          <input style={S.input} value={accountNo} onChange={e => setAccountNo(e.target.value)} placeholder="00000000-01" />
        </div>
        <div>
          <label style={S.label}>서버 유형</label>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={() => setIsVirtual(true)} style={{ ...S.btn(isVirtual ? "#1a5a3e" : "#333"), padding: "8px 16px", fontSize: 12 }}>
              {isVirtual ? "✓ " : ""}모의투자
            </button>
            <button onClick={() => setIsVirtual(false)} style={{ ...S.btn(!isVirtual ? "#5a1a1a" : "#333"), padding: "8px 16px", fontSize: 12 }}>
              {!isVirtual ? "✓ " : ""}실전투자
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={connect} disabled={connecting || !appKey || !appSecret || !accountNo} style={{ ...S.btn(), opacity: connecting ? 0.6 : 1 }}>
          {connecting ? "연결 중..." : "연결하기"}
        </button>
        {result && (
          <span style={{ color: result.success ? "#4cff8b" : "#ff4c4c", fontSize: 12 }}>
            {result.success ? `연결 성공! (${result.is_virtual ? "모의투자" : "실전"})` : result.detail || "연결 실패"}
          </span>
        )}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: "rgba(10,18,40,0.5)", borderRadius: 8 }}>
        <div style={{ color: "#6688aa", fontSize: 11, lineHeight: 1.8 }}>
          한국투자증권 KIS Developers에서 앱키를 발급받으세요.<br />
          모의투자 서버: openapivts.koreainvestment.com:29443<br />
          모의투자 계좌는 HTS에서 신청 가능합니다.
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
function QuotePanel() {
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [period, setPeriod] = useState("D");
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!code) return;
    setLoading(true);
    const [q, c] = await Promise.all([
      kisApi("quote", { code }),
      kisApi("chart", { code, period }),
    ]);
    if (q?.success) {
      // inquire-price에 종목명 필드가 없으므로 chart output1에서 가져옴
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Search */}
      <div style={{ ...S.panel, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{ ...S.input, flex: 1, maxWidth: 200 }} value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()} placeholder="종목코드 (예: 005930)" />
          {["D", "W", "M"].map(p => (
            <button key={p} onClick={() => { setPeriod(p); if (code) setTimeout(search, 0); }}
              style={{ padding: "8px 12px", background: period === p ? "rgba(100,181,246,0.2)" : "transparent", color: period === p ? "#64b5f6" : "#6688aa", border: period === p ? "1px solid rgba(100,181,246,0.3)" : "1px solid transparent", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
              {{ D: "일봉", W: "주봉", M: "월봉" }[p]}
            </button>
          ))}
          <button onClick={search} disabled={loading} style={{ ...S.btn(), padding: "8px 16px", fontSize: 12 }}>
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>
      </div>

      {quote && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {/* Price Card */}
          <div style={{ ...S.panel, flex: "1 1 300px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e0e6f0", marginBottom: 4 }}>{quote.name}</div>
            <div style={{ fontSize: 11, color: "#6688aa", marginBottom: 12 }}>{quote.stock_code}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: clr(quote.change), fontFamily: "'JetBrains Mono',monospace" }}>
              {fmt(quote.price)}<span style={{ fontSize: 14, color: "#6688aa" }}>원</span>
            </div>
            <div style={{ color: clr(quote.change), fontSize: 14, fontFamily: "monospace", marginTop: 4 }}>
              {quote.change > 0 ? "▲" : quote.change < 0 ? "▼" : "—"} {fmt(Math.abs(quote.change))}원 ({fmtPct(quote.change_rate)})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
              {[["시가", quote.open], ["고가", quote.high], ["저가", quote.low], ["거래량", quote.volume], ["PER", quote.per?.toFixed(1)], ["PBR", quote.pbr?.toFixed(2)]].map(([l, v]) => (
                <div key={l}><div style={{ color: "#556677", fontSize: 10 }}>{l}</div><div style={{ color: "#e0e6f0", fontSize: 13, fontFamily: "monospace" }}>{typeof v === "number" ? fmt(v) : v || "—"}</div></div>
              ))}
            </div>
          </div>

          {/* Chart */}
          {chartData && chartData.length > 0 && (
            <div style={{ ...S.panel, flex: "2 1 500px" }}>
              <div style={{ ...S.title, marginBottom: 8 }}>
                {{ D: "일봉", W: "주봉", M: "월봉" }[period]} 차트 ({chartData.length}개)
              </div>
              <MiniCandleChart candles={chartData.slice(0, 60)} width={600} height={250} />
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

  const search = async () => {
    if (!code) return;
    setLoading(true);
    const r = await kisApi("asking", { code });
    if (r?.success) setData(r);
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.panel, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...S.input, maxWidth: 200 }} value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()} placeholder="종목코드" />
          <button onClick={search} disabled={loading} style={{ ...S.btn(), padding: "8px 16px", fontSize: 12 }}>
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

  const search = async () => {
    if (!code) return;
    setLoading(true);
    setError(null);
    setData(null);
    const r = await kisApi("finance", { code });
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
          <input style={{ ...S.input, maxWidth: 200 }} value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()} placeholder="종목코드" />
          <button onClick={search} disabled={loading} style={{ ...S.btn(), padding: "8px 16px", fontSize: 12 }}>
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
