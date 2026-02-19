import { useState, useEffect, useCallback, useRef } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 스윙 백테스트 페이지 / Swing Backtest Page
// 기존 페이지 수정 없이 신규 추가되는 독립 컴포넌트
//
// [변경사항]
// - 매매 기간: 프론트 계산 → 백엔드 trading_period_days 사용
// - 연환산 수익률 표시 추가
// - 일평균 수익: 백엔드 daily_return 기반 정확한 계산
// - 손익비 표시 추가
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const API_BASE = "https://web-production-139e9.up.railway.app";

async function api(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error(`API 오류: ${path}`, e);
    return null;
  }
}

// ── 미니 바 차트 ──
function MiniBar({ value, max, color = "#4fc3f7" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{
      width: "100%", height: 6, background: "rgba(255,255,255,0.06)",
      borderRadius: 3, overflow: "hidden"
    }}>
      <div style={{
        width: `${pct}%`, height: "100%", background: color,
        borderRadius: 3, transition: "width 0.6s ease"
      }} />
    </div>
  );
}

// ── 승률 뱃지 ──
function WinRateBadge({ rate }) {
  const color = rate >= 65 ? "#4cff8b" : rate >= 50 ? "#ffd54f" : "#ff5252";
  return (
    <span style={{
      color, fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 700, fontSize: 14
    }}>
      {rate}%
    </span>
  );
}

// ── 시그널 뱃지 ──
function SignalBadge({ strength }) {
  const styles = {
    "강": { bg: "rgba(76,255,139,0.15)", color: "#4cff8b", border: "rgba(76,255,139,0.3)" },
    "중": { bg: "rgba(255,213,79,0.15)", color: "#ffd54f", border: "rgba(255,213,79,0.3)" },
    "약": { bg: "rgba(255,82,82,0.15)", color: "#ff5252", border: "rgba(255,82,82,0.3)" },
  };
  const s = styles[strength] || styles["약"];
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`
    }}>
      {strength}
    </span>
  );
}

// ── 프로그레스 링 ──
function ProgressRing({ pct, size = 120 }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#4fc3f7" strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="middle"
        fill="#e0e6f0" fontSize={22} fontWeight={700}
        fontFamily="'JetBrains Mono', monospace"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}>
        {pct}%
      </text>
    </svg>
  );
}

// ── 세대 진화 차트 (SVG) ──
function GenerationChart({ generations }) {
  if (!generations || generations.length === 0) return null;
  const W = 680, H = 200, P = 40;
  const scores = generations.map(g =>
    g.best_metrics?.total_return ?? g.best_score ?? 0
  );
  const maxVal = Math.max(...scores.map(Math.abs), 1);
  const minVal = Math.min(...scores, 0);
  const range = maxVal - minVal || 1;
  const barW = Math.min(40, (W - P * 2) / scores.length - 4);

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <rect width={W} height={H} fill="rgba(8,15,30,0.6)" rx={8} />
      {minVal < 0 && (
        <line x1={P} y1={P + ((maxVal) / range) * (H - P * 2)}
          x2={W - 10} y2={P + ((maxVal) / range) * (H - P * 2)}
          stroke="rgba(255,255,255,0.1)" strokeDasharray="4,4" />
      )}
      {scores.map((s, i) => {
        const x = P + i * ((W - P * 2) / scores.length) + 2;
        const barH = (Math.abs(s) / range) * (H - P * 2);
        const y = s >= 0
          ? P + ((maxVal - s) / range) * (H - P * 2)
          : P + (maxVal / range) * (H - P * 2);
        const color = s >= 0 ? "#4cff8b" : "#ff5252";
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 2)}
              fill={color} opacity={0.7} rx={3} />
            <text x={x + barW / 2} y={H - 8} textAnchor="middle"
              fill="#556677" fontSize={9} fontFamily="'JetBrains Mono',monospace">
              {i + 1}세대
            </text>
            <text x={x + barW / 2} y={y - 6} textAnchor="middle"
              fill={color} fontSize={9} fontFamily="'JetBrains Mono',monospace">
              {s > 0 ? "+" : ""}{s.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 패턴 통계 바 차트 ──
function PatternBarChart({ data, title, valueKey = "win_rate", labelKey = "range" }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d[valueKey] || 0), 1);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 12, color: "#8899aa", marginBottom: 8, fontWeight: 600
      }}>
        {title}
      </div>
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const label = d[labelKey] || d.category || "";
        const count = d.count || 0;
        const color = val >= 65 ? "#4cff8b" : val >= 50 ? "#ffd54f" : "#ff5252";
        const pct = (val / maxVal) * 100;
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 6, fontSize: 12
          }}>
            <div style={{
              width: 100, color: "#99aabb", textAlign: "right",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11, flexShrink: 0
            }}>
              {label}
            </div>
            <div style={{
              flex: 1, height: 20, background: "rgba(255,255,255,0.04)",
              borderRadius: 4, overflow: "hidden", position: "relative"
            }}>
              <div style={{
                width: `${pct}%`, height: "100%", background: color, opacity: 0.6,
                borderRadius: 4, transition: "width 0.8s ease"
              }} />
              <span style={{
                position: "absolute", right: 6, top: 2, fontSize: 11,
                color: "#e0e6f0", fontFamily: "'JetBrains Mono',monospace"
              }}>
                {val.toFixed(1)}% ({count}건)
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 에퀴티 커브 (SVG) ──
function EquityCurve({ data }) {
  if (!data || data.length < 2) return null;
  const W = 680, H = 160, P = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2);
    const y = P + ((max - v) / range) * (H - P * 2);
    return `${x},${y}`;
  }).join(" ");

  const fillPoints = `${P},${H - P} ${points} ${P + ((data.length - 1) / (data.length - 1)) * (W - P * 2)},${H - P}`;
  const lastVal = data[data.length - 1];
  const color = lastVal >= 0 ? "#4cff8b" : "#ff5252";

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <rect width={W} height={H} fill="rgba(8,15,30,0.6)" rx={8} />
      {min < 0 && max > 0 && (
        <line x1={P} y1={P + (max / range) * (H - P * 2)}
          x2={W - 10} y2={P + (max / range) * (H - P * 2)}
          stroke="rgba(255,255,255,0.15)" strokeDasharray="4,4" />
      )}
      <polygon points={fillPoints} fill={color} opacity={0.08} />
      <polyline points={points} fill="none" stroke={color}
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <text x={W - P} y={P - 6} textAnchor="end" fill={color}
        fontSize={13} fontWeight={700} fontFamily="'JetBrains Mono',monospace">
        {lastVal > 0 ? "+" : ""}{lastVal.toFixed(1)}%
      </text>
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 컴포넌트 / Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function SwingBacktest() {
  const [tab, setTab] = useState("overview");
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [capital, setCapital] = useState(10000000);
  const [capitalInput, setCapitalInput] = useState("10,000,000");
  const pollRef = useRef(null);

  const fmtWon = (v) => {
    const abs = Math.abs(Math.round(v));
    if (abs >= 100000000) return (v / 100000000).toFixed(1) + "억";
    if (abs >= 10000) return Math.round(v).toLocaleString() + "원";
    return Math.round(v).toLocaleString() + "원";
  };
  const pctToWon = (pct) => fmtWon(capital * pct / 100);
  const applyCapital = () => {
    const val = parseInt(capitalInput.replace(/,/g, ""));
    if (!isNaN(val) && val > 0) setCapital(val);
  };

  // 결과 로드
  useEffect(() => {
    (async () => {
      const data = await api("/api/swing/result");
      if (data && !data.error) setResult(data);
      setLoading(false);
    })();
  }, []);

  // 진행상태 폴링
  useEffect(() => {
    if (!running) return;
    pollRef.current = setInterval(async () => {
      const prog = await api("/api/swing/progress");
      if (prog) {
        setProgress(prog);
        if (prog.status === "done") {
          setRunning(false);
          const data = await api("/api/swing/result");
          if (data && !data.error) setResult(data);
        }
        if (prog.status === "error") {
          setRunning(false);
        }
      }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [running]);

  const startAnalysis = async () => {
    setRunning(true);
    setProgress({ status: "running", pct: 0, step: "시작", message: "분석을 시작합니다..." });
    await api("/api/swing/run", { method: "POST" });
  };

  const TABS = [
    { id: "overview", label: "📊 개요", labelEn: "Overview" },
    { id: "candidates", label: "🔍 발굴 종목", labelEn: "Discovery" },
    { id: "patterns", label: "📈 패턴 통계", labelEn: "Pattern Stats" },
    { id: "calibration", label: "🧬 자동 교정", labelEn: "Calibration" },
  ];

  const styles = {
    page: {
      fontFamily: "'Noto Sans KR', -apple-system, sans-serif",
      color: "#e0e6f0",
      minHeight: "100vh",
      padding: 20,
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 20, flexWrap: "wrap", gap: 12,
    },
    title: {
      fontSize: 20, fontWeight: 700,
      background: "linear-gradient(135deg, #4fc3f7, #81d4fa)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    },
    runBtn: {
      padding: "10px 28px", borderRadius: 8, border: "none",
      background: running
        ? "rgba(255,255,255,0.08)"
        : "linear-gradient(135deg, #4fc3f7, #29b6f6)",
      color: running ? "#778899" : "#0a1628",
      fontWeight: 700, fontSize: 14, cursor: running ? "not-allowed" : "pointer",
      fontFamily: "'Noto Sans KR', sans-serif",
      transition: "all 0.3s",
    },
    tabBar: {
      display: "flex", gap: 4, marginBottom: 20,
      background: "rgba(15,22,40,0.6)", borderRadius: 10, padding: 4,
    },
    tabBtn: (active) => ({
      padding: "8px 18px", borderRadius: 8, border: "none",
      background: active ? "rgba(79,195,247,0.15)" : "transparent",
      color: active ? "#4fc3f7" : "#556677",
      fontWeight: active ? 600 : 400, fontSize: 13, cursor: "pointer",
      fontFamily: "'Noto Sans KR', sans-serif",
      transition: "all 0.2s",
      borderBottom: active ? "2px solid #4fc3f7" : "2px solid transparent",
    }),
    card: {
      background: "linear-gradient(135deg, rgba(25,35,65,0.85), rgba(15,22,48,0.9))",
      border: "1px solid rgba(100,140,200,0.12)",
      borderRadius: 12, padding: 20, marginBottom: 16,
    },
    cardTitle: {
      fontSize: 14, fontWeight: 600, color: "#8899aa",
      marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
    },
    grid2: {
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
    },
    grid3: {
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16,
    },
    grid4: {
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16,
    },
    statBox: {
      background: "rgba(8,15,30,0.5)", borderRadius: 8, padding: 14,
      border: "1px solid rgba(100,140,200,0.08)",
    },
    statLabel: {
      fontSize: 11, color: "#556677", marginBottom: 4,
    },
    statValue: {
      fontSize: 20, fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
    },
    table: {
      width: "100%", borderCollapse: "collapse", fontSize: 12,
    },
    th: {
      textAlign: "left", padding: "8px 10px", color: "#556677",
      borderBottom: "1px solid rgba(100,140,200,0.1)",
      fontWeight: 600, fontSize: 11,
    },
    td: {
      padding: "8px 10px",
      borderBottom: "1px solid rgba(100,140,200,0.06)",
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
    },
    mono: {
      fontFamily: "'JetBrains Mono', monospace",
    },
  };

  // ━━━ 분석 진행 중 화면 ━━━
  if (running && progress) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, textAlign: "center", padding: 60 }}>
          <ProgressRing pct={progress.pct} size={160} />
          <div style={{ marginTop: 24, fontSize: 18, fontWeight: 600 }}>
            {progress.step}
          </div>
          <div style={{ marginTop: 8, color: "#8899aa", fontSize: 13 }}>
            {progress.message}
          </div>
          {progress.error && (
            <div style={{ marginTop: 16, color: "#ff5252", fontSize: 13 }}>
              오류: {progress.error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ━━━ 결과 없음 ━━━
  if (!loading && !result) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <div style={styles.title}>📊 스윙 자동발굴 & 백테스트</div>
        </div>
        <div style={{ ...styles.card, textAlign: "center", padding: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🔬</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
            아직 분석 결과가 없습니다
          </div>
          <div style={{ color: "#8899aa", fontSize: 13, marginBottom: 28, lineHeight: 1.8 }}>
            전종목을 스캔하여 스윙 투자 후보를 자동 발굴하고,<br />
            매매 타이밍 패턴을 통계적으로 분석합니다.<br />
            최적의 매매 파라미터까지 자동으로 찾아냅니다.
          </div>
          <button onClick={startAnalysis} style={styles.runBtn}>
            🚀 분석 시작 (약 5~15분 소요)
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.card, textAlign: "center", padding: 60 }}>
          <div style={{ color: "#8899aa" }}>데이터를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  // ━━━ 결과 데이터 추출 ━━━
  const wp = result?.winner_profile || {};
  const candidates = result?.candidates || [];
  const ps = result?.final_stats || result?.pattern_stats || {};
  const cal = result?.calibration || {};
  const summary = ps?.summary || {};

  return (
    <div style={styles.page}>
      {/* 헤더 */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>📊 스윙 자동발굴 & 백테스트</div>
          <div style={{ fontSize: 11, color: "#556677", marginTop: 4 }}>
            분석일: {result?.timestamp?.slice(0, 10) || "-"} · {result?.stocks_analyzed || 0}개 종목 분석
            {result?.data_source === "naver" && " · 네이버 금융 데이터"}
          </div>
        </div>
        <button onClick={startAnalysis} style={styles.runBtn} disabled={running}>
          {running ? "⏳ 분석 중..." : "🔄 재분석"}
        </button>
      </div>

      {/* 탭 */}
      <div style={styles.tabBar}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={styles.tabBtn(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ━━━ 개요 탭 ━━━ */}
      {tab === "overview" && (
        <>
          {/* 투자금 입력 */}
          <div style={{
            ...styles.card, display: "flex", alignItems: "center", gap: 14,
            padding: "12px 20px", marginBottom: 16,
          }}>
            <span style={{ fontSize: 13, color: "#8899aa", fontWeight: 600, whiteSpace: "nowrap" }}>
              💰 투자금 설정
            </span>
            <div style={{
              display: "flex", alignItems: "center", gap: 2,
              background: "rgba(8,15,30,0.6)", borderRadius: 8,
              border: "1px solid rgba(79,195,247,0.2)", padding: "4px 10px",
            }}>
              <input
                type="text" value={capitalInput}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setCapitalInput(raw ? parseInt(raw).toLocaleString() : "");
                }}
                onKeyDown={e => e.key === "Enter" && applyCapital()}
                style={{
                  background: "transparent", border: "none", outline: "none",
                  color: "#4fc3f7", fontSize: 16, fontWeight: 700, width: 140,
                  fontFamily: "'JetBrains Mono', monospace", textAlign: "right",
                }}
              />
              <span style={{ color: "#556677", fontSize: 13 }}>원</span>
            </div>
            <button onClick={applyCapital} style={{
              padding: "5px 16px", borderRadius: 6, border: "1px solid rgba(79,195,247,0.3)",
              background: "rgba(79,195,247,0.1)", color: "#4fc3f7",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Noto Sans KR', sans-serif",
            }}>
              적용
            </button>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              {[1000000, 5000000, 10000000, 50000000].map(v => (
                <button key={v} onClick={() => {
                  setCapital(v); setCapitalInput(v.toLocaleString());
                }} style={{
                  padding: "3px 10px", borderRadius: 4, border: "none",
                  background: capital === v ? "rgba(79,195,247,0.2)" : "rgba(255,255,255,0.04)",
                  color: capital === v ? "#4fc3f7" : "#556677",
                  fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {v >= 10000000 ? (v / 10000000) + "천만" : (v / 10000).toLocaleString() + "만"}
                </button>
              ))}
            </div>
          </div>

          {/* ★ 핵심 요약 — 총 수익 (복리 기반) */}
          <div style={{ ...styles.card, marginBottom: 16, padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "#556677", marginBottom: 4 }}>총 수익률 / Total Return (복리)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{
                    fontSize: 32, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: (summary.total_return || 0) >= 0 ? "#4cff8b" : "#ff5252",
                  }}>
                    {(summary.total_return || 0) > 0 ? "+" : ""}{(summary.total_return || 0).toFixed(1)}%
                  </span>
                  <span style={{
                    fontSize: 22, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: (summary.total_return || 0) >= 0 ? "#4cff8b" : "#ff5252",
                    opacity: 0.85,
                  }}>
                    ({(summary.total_return || 0) > 0 ? "+" : ""}{pctToWon(summary.total_return || 0)})
                  </span>
                </div>
              </div>
              {/* ★ 수정: 백엔드에서 정확한 값 사용 */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#556677" }}>매매 기간</div>
                  <div style={{ ...styles.mono, fontSize: 16, fontWeight: 700, color: "#e0e6f0" }}>
                    {summary.trading_period_days || "—"}일
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#556677" }}>총 매매</div>
                  <div style={{ ...styles.mono, fontSize: 16, fontWeight: 700, color: "#e0e6f0" }}>
                    {summary.total_trades || 0}건
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#556677" }}>연환산 수익률</div>
                  <div style={{
                    ...styles.mono, fontSize: 16, fontWeight: 700,
                    color: (summary.annualized_return || 0) >= 0 ? "#4cff8b" : "#ff5252",
                  }}>
                    {(summary.annualized_return || 0) > 0 ? "+" : ""}{(summary.annualized_return || 0).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#556677" }}>일평균 수익</div>
                  <div style={{
                    ...styles.mono, fontSize: 16, fontWeight: 700,
                    color: (summary.daily_return || 0) >= 0 ? "#4cff8b" : "#ff5252",
                  }}>
                    {((summary.daily_return || 0) >= 0 ? "+" : "")}{fmtWon(capital * (summary.daily_return || 0) / 100)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ★ 승률 + MDD + 샤프 + 손익비 (4열) */}
          <div style={styles.grid4}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>승률 / Win Rate</div>
              <div style={{ ...styles.statValue, color: "#ffd54f" }}>
                {(summary.win_rate || 0).toFixed(1)}%
              </div>
              <div style={{ fontSize: 11, color: "#556677", marginTop: 2 }}>
                {summary.win_count || 0}승 {summary.loss_count || 0}패 / {summary.total_trades || 0}건
              </div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>MDD (최대 낙폭)</div>
              <div style={{ ...styles.statValue, color: "#ff5252" }}>
                {(summary.mdd || 0).toFixed(1)}%
              </div>
              <div style={{ fontSize: 11, color: "#556677", marginTop: 2 }}>
                ({pctToWon(summary.mdd || 0)})
              </div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>샤프 비율 / Sharpe</div>
              <div style={{
                ...styles.statValue,
                color: (summary.sharpe_ratio || 0) >= 1 ? "#4cff8b" : "#ffd54f"
              }}>
                {(summary.sharpe_ratio || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "#556677", marginTop: 2 }}>
                1.0 이상 = 양호
              </div>
            </div>
            {/* ★ 추가: 손익비 */}
            <div style={styles.statBox}>
              <div style={styles.statLabel}>손익비 / P/L Ratio</div>
              <div style={{
                ...styles.statValue,
                color: (summary.profit_loss_ratio || 0) >= 2 ? "#4cff8b" : (summary.profit_loss_ratio || 0) >= 1.5 ? "#ffd54f" : "#ff5252"
              }}>
                {(summary.profit_loss_ratio || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: "#556677", marginTop: 2 }}>
                2.0 이상 = 양호
              </div>
            </div>
          </div>

          <div style={{ ...styles.grid2, marginTop: 16 }}>
            {/* 에퀴티 커브 */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>📈 누적 수익 곡선 / Equity Curve (복리)</div>
              <EquityCurve data={ps?.equity_curve || [0]} />
            </div>

            {/* 상승 종목 공통 조건 */}
            <div style={styles.card}>
              <div style={styles.cardTitle}>
                🏆 상승 종목 공통 조건 ({wp.total_winners || 0}개 분석)
              </div>
              {(wp.top_conditions || []).slice(0, 8).map((c, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 8, fontSize: 12,
                }}>
                  <span style={{ color: "#99aabb" }}>{c.condition}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, width: 180 }}>
                    <MiniBar value={c.match_pct} max={100}
                      color={c.match_pct >= 60 ? "#4cff8b" : "#4fc3f7"} />
                    <span style={{
                      ...styles.mono, fontSize: 11, color: "#e0e6f0", width: 40, textAlign: "right"
                    }}>
                      {c.match_pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 매매 상세 */}
          <div style={{ ...styles.grid2, marginTop: 0 }}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>평균 수익 / Avg Win</div>
              <div style={{ ...styles.mono, color: "#4cff8b", fontSize: 16, fontWeight: 700 }}>
                +{(summary.avg_win || 0).toFixed(2)}%
              </div>
              <div style={{ ...styles.mono, color: "#4cff8b", fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                (+{pctToWon(summary.avg_win || 0)})
              </div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>평균 손실 / Avg Loss</div>
              <div style={{ ...styles.mono, color: "#ff5252", fontSize: 16, fontWeight: 700 }}>
                {(summary.avg_loss || 0).toFixed(2)}%
              </div>
              <div style={{ ...styles.mono, color: "#ff5252", fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                ({pctToWon(summary.avg_loss || 0)})
              </div>
            </div>
          </div>
          <div style={{ ...styles.grid2, marginTop: 8 }}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>최대 수익 / Max Win</div>
              <div style={{ ...styles.mono, color: "#4cff8b", fontSize: 14 }}>
                +{(summary.max_profit || 0).toFixed(2)}%
                <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 8 }}>
                  (+{pctToWon(summary.max_profit || 0)})
                </span>
              </div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>평균 보유일 / Avg Hold</div>
              <div style={{ ...styles.mono, color: "#4fc3f7", fontSize: 14 }}>
                {(summary.avg_holding_days || 0).toFixed(1)}일
              </div>
            </div>
          </div>

          {/* ★ 종목별 매매 성과 (종목명 표시 개선) */}
          {(ps?.stock_stats || []).length > 0 && (
            <div style={{ ...styles.card, marginTop: 16 }}>
              <div style={styles.cardTitle}>
                📋 종목별 매매 성과 ({(ps?.stock_stats || []).length}개 종목)
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>종목명</th>
                      <th style={styles.th}>수익률</th>
                      <th style={styles.th}>수익금</th>
                      <th style={styles.th}>매매 기간</th>
                      <th style={styles.th}>매매수</th>
                      <th style={styles.th}>승률</th>
                      <th style={styles.th}>평균 수익</th>
                      <th style={styles.th}>최대 수익</th>
                      <th style={styles.th}>최대 손실</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ps?.stock_stats || []).map((s, i) => (
                      <tr key={i} style={{
                        background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"
                      }}>
                        <td style={{ ...styles.td, color: "#556677" }}>{i + 1}</td>
                        <td style={{
                          ...styles.td, fontFamily: "'Noto Sans KR',sans-serif", fontWeight: 600
                        }}>
                          {/* ★ 수정: 종목명 우선, 코드 아래 표시 */}
                          <div>{(s.name && s.name !== s.code) ? s.name : s.code}</div>
                          <div style={{ fontSize: 10, color: "#556677" }}>{s.code}</div>
                        </td>
                        <td style={{
                          ...styles.td, fontWeight: 700,
                          color: (s.total_return || 0) >= 0 ? "#4cff8b" : "#ff5252"
                        }}>
                          {(s.total_return || 0) > 0 ? "+" : ""}{(s.total_return || 0).toFixed(2)}%
                        </td>
                        <td style={{
                          ...styles.td, fontWeight: 600,
                          color: (s.total_return || 0) >= 0 ? "#4cff8b" : "#ff5252"
                        }}>
                          {pctToWon(s.total_return || 0)}
                        </td>
                        <td style={styles.td}>
                          {s.trade_period_days || 0}일
                          <div style={{ fontSize: 10, color: "#556677" }}>
                            (평균 {s.avg_holding_days || 0}일/건)
                          </div>
                        </td>
                        <td style={styles.td}>
                          {s.total_trades || 0}건
                          <div style={{ fontSize: 10, color: "#556677" }}>
                            {s.win_count || 0}승 {s.loss_count || 0}패
                          </div>
                        </td>
                        <td style={styles.td}>
                          <span style={{
                            fontWeight: 700,
                            color: (s.win_rate || 0) >= 60 ? "#4cff8b"
                              : (s.win_rate || 0) >= 50 ? "#ffd54f" : "#ff5252"
                          }}>
                            {(s.win_rate || 0).toFixed(0)}%
                          </span>
                        </td>
                        <td style={{
                          ...styles.td,
                          color: (s.avg_profit || 0) >= 0 ? "#4cff8b" : "#ff5252"
                        }}>
                          {(s.avg_profit || 0) > 0 ? "+" : ""}{(s.avg_profit || 0).toFixed(2)}%
                        </td>
                        <td style={{ ...styles.td, color: "#4cff8b" }}>
                          +{(s.max_profit || 0).toFixed(2)}%
                        </td>
                        <td style={{ ...styles.td, color: "#ff5252" }}>
                          {(s.max_loss || 0).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ━━━ 발굴 종목 탭 ━━━ */}
      {tab === "candidates" && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            🔍 자동 발굴 후보 종목 ({candidates.length}개)
          </div>
          {candidates.length === 0 ? (
            <div style={{ color: "#556677", textAlign: "center", padding: 40 }}>
              발굴된 종목이 없습니다. 분석을 실행해주세요.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>종목명</th>
                    <th style={styles.th}>현재가</th>
                    <th style={styles.th}>점수</th>
                    <th style={styles.th}>신호</th>
                    <th style={styles.th}>충족 조건</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => (
                    <tr key={i} style={{
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"
                    }}>
                      <td style={{ ...styles.td, color: "#556677" }}>{i + 1}</td>
                      <td style={{ ...styles.td, fontFamily: "'Noto Sans KR',sans-serif", fontWeight: 600 }}>
                        <div>{c.name}</div>
                        <div style={{ fontSize: 10, color: "#556677" }}>{c.code}</div>
                      </td>
                      <td style={styles.td}>
                        {(c.current_price || 0).toLocaleString()}원
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <MiniBar value={c.score} max={100}
                            color={c.score >= 70 ? "#4cff8b" : c.score >= 50 ? "#ffd54f" : "#4fc3f7"} />
                          <span style={{ fontWeight: 700 }}>{c.score}</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <SignalBadge strength={c.signal_strength} />
                      </td>
                      <td style={{
                        ...styles.td, fontSize: 11,
                        fontFamily: "'Noto Sans KR',sans-serif", maxWidth: 300,
                      }}>
                        {(c.matched_conditions || []).map((cond, j) => (
                          <span key={j} style={{
                            display: "inline-block", padding: "1px 6px",
                            background: "rgba(79,195,247,0.1)",
                            borderRadius: 4, marginRight: 4, marginBottom: 2,
                            color: "#81d4fa", fontSize: 10,
                          }}>
                            {cond}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ━━━ 패턴 통계 탭 ━━━ */}
      {tab === "patterns" && (
        <>
          <div style={styles.grid2}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>📉 눌림 깊이별 승률 / Pullback Depth</div>
              <PatternBarChart data={ps?.pullback_stats} title="" labelKey="range" />
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>📊 거래량 변화별 승률 / Volume Change</div>
              <PatternBarChart data={ps?.volume_stats} title="" labelKey="range" />
            </div>
          </div>
          <div style={styles.grid2}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>📈 RSI 구간별 승률</div>
              <PatternBarChart data={ps?.rsi_stats} title="" labelKey="range" />
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>🕯️ 봉 패턴별 승률 / Candle Patterns</div>
              <PatternBarChart data={ps?.pattern_stats} title="" labelKey="category" />
            </div>
          </div>
          <div style={styles.grid2}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>📅 요일별 승률 / Weekday</div>
              <PatternBarChart data={ps?.weekday_stats} title="" labelKey="category" />
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>📊 MA 배열별 승률</div>
              <PatternBarChart data={ps?.ma_stats} title="" labelKey="category" />
            </div>
          </div>
          <div style={styles.grid2}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>🎯 볼린저밴드 위치별 승률</div>
              <PatternBarChart data={ps?.bb_stats} title="" labelKey="range" />
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>🚪 매도 사유별 통계 / Exit Reasons</div>
              <PatternBarChart data={ps?.exit_stats} title="" labelKey="category" />
            </div>
          </div>
        </>
      )}

      {/* ━━━ 자동 교정 탭 ━━━ */}
      {tab === "calibration" && (
        <>
          {/* 최적 파라미터 */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>🧬 최적 파라미터 / Optimized Parameters</div>
            <div style={styles.grid3}>
              {Object.entries(cal.best_params || {}).map(([key, val]) => {
                const labels = {
                  pullback_min: "최소 눌림 %",
                  pullback_max: "최대 눌림 %",
                  trailing_pct: "트레일링 스톱 %",
                  stop_loss_pct: "손절 %",
                  max_hold_days: "최대 보유일",
                };
                return (
                  <div key={key} style={styles.statBox}>
                    <div style={styles.statLabel}>{labels[key] || key}</div>
                    <div style={{
                      ...styles.mono, fontSize: 22, fontWeight: 700, color: "#4fc3f7"
                    }}>
                      {typeof val === "number" ? val.toFixed(1) : val}
                      {key.includes("pct") || key.includes("loss") ? "%" : ""}
                      {key.includes("days") ? "일" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 최적 파라미터 성과 */}
          {cal.best_metrics && (
            <div style={styles.card}>
              <div style={styles.cardTitle}>📊 최적 파라미터 성과 / Optimized Performance</div>
              <div style={styles.grid3}>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>총 수익률</div>
                  <div style={{
                    ...styles.statValue,
                    color: (cal.best_metrics.total_return || 0) >= 0 ? "#4cff8b" : "#ff5252"
                  }}>
                    {(cal.best_metrics.total_return || 0) > 0 ? "+" : ""}
                    {(cal.best_metrics.total_return || 0).toFixed(1)}%
                  </div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>승률</div>
                  <div style={{ ...styles.statValue, color: "#ffd54f" }}>
                    {(cal.best_metrics.win_rate || 0).toFixed(1)}%
                  </div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>MDD</div>
                  <div style={{ ...styles.statValue, color: "#ff5252" }}>
                    {(cal.best_metrics.mdd || 0).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 세대별 진화 차트 */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>
              🧬 세대별 진화 과정 ({(cal.generations || []).length}세대)
            </div>
            <GenerationChart generations={cal.generations} />

            {(cal.generations || []).length > 0 && (
              <div style={{ marginTop: 16, overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>세대</th>
                      <th style={styles.th}>수익률</th>
                      <th style={styles.th}>승률</th>
                      <th style={styles.th}>MDD</th>
                      <th style={styles.th}>매매수</th>
                      <th style={styles.th}>점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cal.generations || []).map((g, i) => {
                      const m = g.best_metrics || {};
                      return (
                        <tr key={i}>
                          <td style={styles.td}>{g.generation}세대</td>
                          <td style={{
                            ...styles.td,
                            color: (m.total_return || 0) >= 0 ? "#4cff8b" : "#ff5252"
                          }}>
                            {(m.total_return || 0) > 0 ? "+" : ""}{(m.total_return || 0).toFixed(1)}%
                          </td>
                          <td style={styles.td}>
                            <WinRateBadge rate={(m.win_rate || 0).toFixed(1)} />
                          </td>
                          <td style={{ ...styles.td, color: "#ff5252" }}>
                            {(m.mdd || 0).toFixed(1)}%
                          </td>
                          <td style={styles.td}>{m.total_trades || 0}회</td>
                          <td style={{ ...styles.td, color: "#4fc3f7" }}>
                            {(g.best_score || 0).toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
