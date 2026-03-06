import { useState, useEffect, useCallback } from "react";

// KIS credentials: localStorage에서 읽기 (KisTrading과 동일)
const KIS_STORAGE_KEY = "kis_credentials";
function getKisCredentials() {
  try {
    return JSON.parse(localStorage.getItem(KIS_STORAGE_KEY) || "{}");
  } catch { return {}; }
}

async function kisApi(route, params = {}) {
  try {
    const creds = getKisCredentials();
    const url = new URL("/api/kis", window.location.origin);
    url.searchParams.set("_route", route);
    if (creds.app_key) url.searchParams.set("_ak", creds.app_key);
    if (creds.app_secret) url.searchParams.set("_as", creds.app_secret);
    if (creds.account_no) url.searchParams.set("_acct", creds.account_no);
    if (creds.is_virtual !== undefined) url.searchParams.set("_virt", String(creds.is_virtual));
    if (creds.access_token) url.searchParams.set("_token", creds.access_token);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v); });

    const res = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        ...(creds.app_key && { "x-kis-appkey": creds.app_key }),
        ...(creds.app_secret && { "x-kis-appsecret": creds.app_secret }),
        ...(creds.account_no && { "x-kis-account": creds.account_no }),
        ...(creds.is_virtual !== undefined && { "x-kis-virtual": String(creds.is_virtual) }),
        ...(creds.access_token && { "x-kis-token": creds.access_token }),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const fmt = (n) => n?.toLocaleString("ko-KR") ?? "—";
const fmtPct = (n) => n != null ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "—";
const clr = (n) => (n > 0 ? "#ff4444" : n < 0 ? "#4488ff" : "#8899aa");

const S = {
  panel: { background: "linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 16 },
  title: { color: "#e0e6f0", fontWeight: 600, fontSize: 15, marginBottom: 12 },
  th: { padding: "8px 6px", color: "#6688aa", textAlign: "left", fontSize: 11, borderBottom: "1px solid rgba(100,140,200,0.2)" },
  td: { padding: "6px 6px", fontSize: 12, borderBottom: "1px solid rgba(100,140,200,0.08)" },
  btn: (active) => ({
    padding: "8px 16px", background: active ? "rgba(26,58,110,0.6)" : "rgba(15,22,48,0.6)",
    color: active ? "#64b5f6" : "#6688aa", border: active ? "1px solid rgba(100,180,246,0.3)" : "1px solid rgba(100,140,200,0.1)",
    borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400,
  }),
};

// ============================================================
// Market Analysis Main Component
// ============================================================
export default function MarketAnalysis() {
  const [tab, setTab] = useState("index");

  const tabs = [
    { id: "index", label: "시장 지수", icon: "📊" },
    { id: "volume", label: "거래량 순위", icon: "🔥" },
    { id: "rising", label: "급등 종목", icon: "📈" },
    { id: "falling", label: "급락 종목", icon: "📉" },
    { id: "investor", label: "투자자 동향", icon: "👥" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={S.btn(tab === t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "index" && <MarketIndexPanel />}
      {tab === "volume" && <VolumeRankPanel />}
      {tab === "rising" && <FluctuationPanel sort="0" title="급등 종목 TOP 30" />}
      {tab === "falling" && <FluctuationPanel sort="1" title="급락 종목 TOP 30" />}
      {tab === "investor" && <InvestorPanel />}
    </div>
  );
}

// ============================================================
// Market Index Panel
// ============================================================
function MarketIndexPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await kisApi("index");
      if (r?.success) setData(r);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#6688aa" }}>지수 조회 중...</div>;
  if (!data) return <div style={{ ...S.panel, textAlign: "center", padding: 40, color: "#ff9800" }}>지수 조회 실패 - KIS API 설정을 확인하세요</div>;

  const IndexCard = ({ name, idx, emoji }) => (
    <div style={{ ...S.panel, flex: "1 1 350px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ color: "#6688aa", fontSize: 12, marginBottom: 4 }}>{emoji} {name}</div>
          <div style={{ color: clr(idx.change), fontSize: 36, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
            {idx.price?.toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: clr(idx.change), fontSize: 16, fontFamily: "monospace" }}>
            {idx.change > 0 ? "▲" : idx.change < 0 ? "▼" : "—"} {Math.abs(idx.change)?.toFixed(2)}
          </div>
          <div style={{ color: clr(idx.change_rate), fontSize: 14, fontFamily: "monospace" }}>
            ({fmtPct(idx.change_rate)})
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, borderTop: "1px solid rgba(100,140,200,0.1)", paddingTop: 12 }}>
        <div><div style={{ color: "#556677", fontSize: 10 }}>거래량</div><div style={{ color: "#e0e6f0", fontSize: 13, fontFamily: "monospace" }}>{fmt(idx.volume)}</div></div>
        <div><div style={{ color: "#556677", fontSize: 10 }}>거래대금</div><div style={{ color: "#e0e6f0", fontSize: 13, fontFamily: "monospace" }}>{fmt(Math.round(idx.trade_amount / 1000000))}백만</div></div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <IndexCard name="KOSPI" idx={data.kospi} emoji="🇰🇷" />
      <IndexCard name="KOSDAQ" idx={data.kosdaq} emoji="🚀" />
    </div>
  );
}

// ============================================================
// Volume Rank Panel
// ============================================================
function VolumeRankPanel() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState("J");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await kisApi("ranking/volume", { market });
    if (r?.success) setData(r.items);
    setLoading(false);
  }, [market]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={S.title}>거래량 순위 TOP 30</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["J", "전체"], ["0", "코스피"], ["1", "코스닥"]].map(([v, l]) => (
            <button key={v} onClick={() => setMarket(v)} style={S.btn(market === v)}>{l}</button>
          ))}
          <button onClick={load} style={{ ...S.btn(false), marginLeft: 8 }}>새로고침</button>
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#6688aa" }}>조회 중...</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["순위", "종목명", "종목코드", "현재가", "전일대비", "등락률", "거래량", "거래대금"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((item, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "rgba(10,18,40,0.3)" : "transparent" }}>
                <td style={{ ...S.td, color: i < 3 ? "#ffd54f" : "#6688aa", fontWeight: i < 3 ? 700 : 400, textAlign: "center" }}>{item.rank}</td>
                <td style={{ ...S.td, color: "#e0e6f0", fontWeight: 600 }}>{item.stock_name}</td>
                <td style={{ ...S.td, color: "#6688aa", fontFamily: "monospace" }}>{item.stock_code}</td>
                <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(item.price)}</td>
                <td style={{ ...S.td, color: clr(item.change), fontFamily: "monospace" }}>{item.change > 0 ? "+" : ""}{fmt(item.change)}</td>
                <td style={{ ...S.td, color: clr(item.change_rate), fontFamily: "monospace", fontWeight: 600 }}>{fmtPct(item.change_rate)}</td>
                <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(item.volume)}</td>
                <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(Math.round(item.trade_amount / 1000000))}백만</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================
// Fluctuation Rank Panel (급등/급락)
// ============================================================
function FluctuationPanel({ sort, title }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState("J");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await kisApi("ranking/fluctuation", { market, sort });
    if (r?.success) setData(r.items);
    setLoading(false);
  }, [market, sort]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={S.title}>{sort === "0" ? "📈" : "📉"} {title}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["J", "전체"], ["0", "코스피"], ["1", "코스닥"]].map(([v, l]) => (
            <button key={v} onClick={() => setMarket(v)} style={S.btn(market === v)}>{l}</button>
          ))}
          <button onClick={load} style={{ ...S.btn(false), marginLeft: 8 }}>새로고침</button>
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#6688aa" }}>조회 중...</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["순위", "종목명", "종목코드", "현재가", "전일대비", "등락률", "거래량"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((item, i) => {
              const isUp = sort === "0";
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? "rgba(10,18,40,0.3)" : "transparent" }}>
                  <td style={{ ...S.td, color: i < 3 ? "#ffd54f" : "#6688aa", fontWeight: i < 3 ? 700 : 400, textAlign: "center" }}>{item.rank}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontWeight: 600 }}>{item.stock_name}</td>
                  <td style={{ ...S.td, color: "#6688aa", fontFamily: "monospace" }}>{item.stock_code}</td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(item.price)}</td>
                  <td style={{ ...S.td, color: clr(item.change), fontFamily: "monospace" }}>{item.change > 0 ? "+" : ""}{fmt(item.change)}</td>
                  <td style={{
                    ...S.td, fontFamily: "monospace", fontWeight: 700, fontSize: 13,
                    color: isUp ? "#ff4444" : "#4488ff",
                    background: isUp
                      ? `rgba(255,68,68,${Math.min(Math.abs(item.change_rate) / 30, 0.2)})`
                      : `rgba(68,136,255,${Math.min(Math.abs(item.change_rate) / 30, 0.2)})`,
                  }}>
                    {fmtPct(item.change_rate)}
                  </td>
                  <td style={{ ...S.td, color: "#e0e6f0", fontFamily: "monospace" }}>{fmt(item.volume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================
// Investor Trend Panel (투자자 동향)
// ============================================================
function InvestorPanel() {
  const [code, setCode] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);

  const search = async () => {
    if (!code) return;
    setLoading(true);
    const [inv, q] = await Promise.all([
      kisApi(`investor/${code}`),
      kisApi(`quote/${code}`),
    ]);
    if (inv?.success) setData(inv.data);
    if (q?.success) setQuote(q);
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...S.panel, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{
            width: 200, padding: "10px 14px", background: "rgba(10,18,40,0.8)",
            border: "1px solid rgba(100,140,200,0.2)", borderRadius: 8, color: "#e0e6f0", fontSize: 13, outline: "none",
            fontFamily: "'JetBrains Mono',monospace",
          }} value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()} placeholder="종목코드 (예: 005930)" />
          <button onClick={search} disabled={loading} style={{
            padding: "10px 20px", background: "linear-gradient(135deg,#1a3a6e,#2a5098)",
            color: "#e0e6f0", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            {loading ? "조회 중..." : "투자자 동향 조회"}
          </button>
        </div>
      </div>

      {quote && (
        <div style={{ ...S.panel, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 16 }}>{quote.name}</span>
            <span style={{ color: "#6688aa", fontSize: 12 }}>{quote.stock_code}</span>
            <span style={{ color: clr(quote.change), fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>
              {fmt(quote.price)}원
            </span>
            <span style={{ color: clr(quote.change_rate), fontSize: 13, fontFamily: "monospace" }}>
              ({fmtPct(quote.change_rate)})
            </span>
          </div>
        </div>
      )}

      {data && data.length > 0 && (
        <div style={S.panel}>
          <div style={S.title}>투자자별 매매동향</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{Object.keys(data[0]).slice(0, 10).map(k => <th key={k} style={{ ...S.th, fontSize: 10, whiteSpace: "nowrap" }}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {data.slice(0, 20).map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "rgba(10,18,40,0.3)" : "transparent" }}>
                  {Object.values(row).slice(0, 10).map((v, j) => {
                    const numVal = parseFloat(v);
                    const isNum = !isNaN(numVal) && j > 0;
                    return (
                      <td key={j} style={{
                        ...S.td, fontFamily: isNum ? "monospace" : "inherit",
                        color: isNum ? clr(numVal) : "#e0e6f0",
                        fontWeight: isNum && Math.abs(numVal) > 0 ? 600 : 400,
                      }}>
                        {isNum ? fmt(numVal) : v || "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
