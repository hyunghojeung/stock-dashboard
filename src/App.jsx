// ============================================================
// StrategyPage 교체용 코드
// ============================================================
// 
// App.jsx에서 기존 function StrategyPage() { ... } 전체를
// 아래 코드로 통째로 교체하세요.
//
// 교체 방법:
// 1. App.jsx에서 "function StrategyPage()" 검색
// 2. 해당 함수 시작부터 닫는 중괄호(})까지 전체 삭제
// 3. 아래 코드 전체를 그 자리에 붙여넣기
// 4. Commit
// ============================================================

function StrategyPage() {
  const [tab, setTab] = React.useState("overview");
  const { data: strategies, loading } = useApi("/api/strategy/", 0);

  if (loading) return <Loader t="전략 정보 로딩..." />;

  const tabs = [
    { id: "overview", label: "📊 전체 요약", color: "#64b5f6" },
    { id: "dip", label: "📉 눌림목전략", color: "#4cff8b" },
    { id: "gap", label: "📈 갭상승전략", color: "#ffd54f" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 탭 네비게이션 */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: "rgba(10,18,40,0.6)", borderRadius: 10, border: "1px solid rgba(100,140,200,0.1)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "10px 16px",
            background: tab === t.id ? "rgba(26,58,110,0.6)" : "transparent",
            color: tab === t.id ? t.color : "#556677",
            border: tab === t.id ? `1px solid ${t.color}33` : "1px solid transparent",
            borderRadius: 8, cursor: "pointer", fontSize: 13,
            fontWeight: tab === t.id ? 600 : 400,
            fontFamily: "'Noto Sans KR', sans-serif", transition: "all 0.2s"
          }}>{t.label}</button>
        ))}
      </div>

      {/* 탭 내용 */}
      {tab === "overview" && <StrategyOverviewTab />}
      {tab === "dip" && <DipStrategyTab />}
      {tab === "gap" && <GapStrategyTab />}
    </div>
  );
}

/* ── 전체 요약 탭 ── */
function StrategyOverviewTab() {
  const strats = [
    { name: "눌림목전략 (Dip-Buy)", icon: "📉", status: "가동 중", sc: "#4cff8b",
      desc: "장 시작 30분 후 분봉 데이터 축적 → 7가지 복합 신호로 눌림목 감지 → 자동 매수",
      time: "09:30 ~ 15:00", signals: "ATR범위내하락, 봉차트반등, 거래량감소, MA지지, RSI반등, VWAP지지, 호가매수우세",
      exit: "트레일링 스톱 + 3단계 손절" },
    { name: "갭상승전략 (Gap-Up)", icon: "📈", status: "가동 중", sc: "#ffd54f",
      desc: "전일 종가 대비 +2% 이상 갭상승 종목 → 장 초반 초기 눌림 후 돌파 시 매수",
      time: "09:00 ~ 09:30", signals: "갭비율 2~15%, 거래량급증, 시가지지, 초기눌림반등, 호가매수우세",
      exit: "빠른 트레일링 스톱 (ATR×1.2) + 갭하단 손절" }
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 전략 카드 2개 */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {strats.map((s, i) => (
          <div key={i} style={{ flex: "1 1 340px", background: "linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))", border: `1px solid ${s.sc}22`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15 }}>{s.icon} {s.name}</div>
              <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: `${s.sc}15`, color: s.sc, border: `1px solid ${s.sc}33` }}>{s.status}</span>
            </div>
            <div style={{ color: "#8899aa", fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>{s.desc}</div>
            {[["매매 시간대", s.time], ["매수 신호", s.signals], ["매도 전략", s.exit]].map(([l, v]) => (
              <div key={l} style={{ marginBottom: 8 }}>
                <div style={{ color: "#556677", fontSize: 11, marginBottom: 2 }}>{l}</div>
                <div style={{ color: s.sc, fontSize: 12, fontFamily: "monospace" }}>{v}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 시간대별 타임라인 */}
      <div style={{ background: "linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 20 }}>
        <div style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15, marginBottom: 16 }}>⏱️ 시간대별 전략 운영</div>
        <div style={{ position: "relative", height: 80 }}>
          <div style={{ position: "absolute", top: 28, left: 0, right: 0, height: 24, background: "rgba(10,18,40,0.6)", borderRadius: 12 }} />
          <div style={{ position: "absolute", top: 28, left: "0%", width: "7.7%", height: 24, background: "linear-gradient(90deg,#ffd54f33,#ffd54f55)", borderRadius: "12px 0 0 12px", borderRight: "2px solid #ffd54f" }} />
          <div style={{ position: "absolute", top: 8, left: "0%", color: "#ffd54f", fontSize: 11, fontWeight: 600 }}>갭상승</div>
          <div style={{ position: "absolute", top: 28, left: "7.7%", width: "7.7%", height: 24, background: "rgba(100,140,200,0.1)", borderRight: "1px dashed rgba(100,140,200,0.3)" }} />
          <div style={{ position: "absolute", top: 56, left: "7.7%", color: "#556677", fontSize: 10 }}>데이터 축적</div>
          <div style={{ position: "absolute", top: 28, left: "15.4%", width: "84.6%", height: 24, background: "linear-gradient(90deg,#4cff8b33,#4cff8b22)", borderRadius: "0 12px 12px 0" }} />
          <div style={{ position: "absolute", top: 8, left: "15.4%", color: "#4cff8b", fontSize: 11, fontWeight: 600 }}>눌림목</div>
          {["09:00","09:15","09:30","12:00","15:00","15:30"].map((t, i) => {
            const pos = [0, 3.85, 7.7, 46, 92.3, 100];
            return <div key={t} style={{ position: "absolute", bottom: -4, left: `${pos[i]}%`, color: "#445566", fontSize: 9, fontFamily: "monospace", transform: i > 0 && i < 5 ? "translateX(-50%)" : i === 5 ? "translateX(-100%)" : "none" }}>{t}</div>;
          })}
        </div>
      </div>

      {/* 공통 시스템 */}
      <div style={{ background: "linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 20 }}>
        <div style={{ color: "#e0e6f0", fontWeight: 600, fontSize: 15, marginBottom: 16 }}>🔧 공통 시스템 구조</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {[["야간 스캔","18:00 전종목 분석 → 후보 선별","#64b5f6"],
            ["감시종목","08:30 후보 최종 확인 → 5~10개 확정","#4fc3f7"],
            ["종목 점수제","거래량30 + 추세25 + 테마20 + 기술15 + 수급10","#81c784"],
            ["카카오 알림","매수/매도/시스템 이벤트 실시간 알림","#ffd54f"],
            ["리스크 관리","일일 최대 손실 한도 + 연패 자동 중지","#ff4444"],
            ["수수료 계산","매수 0.015% + 매도 0.015% + 세금 0.18%","#ff9800"]
          ].map(([t, d, c]) => (
            <div key={t} style={{ flex: "1 1 200px", padding: 12, background: "rgba(10,18,40,0.5)", borderRadius: 8, borderLeft: `3px solid ${c}` }}>
              <div style={{ color: c, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t}</div>
              <div style={{ color: "#8899aa", fontSize: 11, lineHeight: 1.5 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 눌림목전략 상세 탭 ── */
function DipStrategyTab() {
  const sections = [
    { title: "1. 종목 선정 (점수제 100점)", color: "#64b5f6", items: [
      "거래량 (30점): 최근 거래량 추세 평가",
      "상승추세 (25점): 가격 변동률 기반",
      "테마/관심도 (20점): 거래대금 기반",
      "기술적 신호 (15점): RSI, MACD 등",
      "수급 (10점): 매수/매도 잔량 비율"] },
    { title: "2. 매수 타이밍 (7가지 복합 신호)", color: "#4cff8b", items: [
      "✅ 필수: ATR 범위 내 하락 + 봉차트 반등 패턴",
      "선택: 거래량 감소, MA 지지, RSI 반등, VWAP 지지, 호가창 매수우세",
      "7개 중 필수 2개 포함 4개 이상 → 매수"] },
    { title: "3. 봉차트 패턴 점수", color: "#ffd54f", items: [
      "반등: 샛별형(+30), 상승장악형(+25), 망치형(+20), 상승잉태형(+15), 역망치형(+10)",
      "하락: 하락장악형(차단), 저녁별형(차단), 교수형(-20)"] },
    { title: "4. 익절 (트레일링 스톱)", color: "#ff9800", items: [
      "스톱가 = 최고점 - (ATR × 배수)",
      "가격 상승 시 스톱가도 상승 (절대 하락 안 함)",
      "변동성 자동 적응 (ATR 기반)"] },
    { title: "5. 손절 (3단계 안전장치)", color: "#ff4444", items: [
      "1차: VWAP - (ATR × 0.5) 이탈",
      "2차: 5분봉 20MA 2봉 연속 이탈",
      "3차: 매수가 대비 절대 -3% (최후 안전장치)"] },
    { title: "6. 매매 시간", color: "#ce93d8", items: [
      "매수 가능: 09:30 ~ 14:30 (분봉 데이터 축적 후)",
      "매도 가능: 09:30 ~ 15:20",
      "15:20 이후 보유종목 → 강제 청산"] }
  ];
  return (
    <div style={{ background: "linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 24 }}>
      <h2 style={{ color: "#e0e6f0", fontSize: 18, margin: "0 0 20px" }}>📉 눌림목전략 상세 (Dip-Buy Strategy)</h2>
      {sections.map((s, idx) => (
        <div key={idx} style={{ marginBottom: 16, padding: 14, background: "rgba(10,18,40,0.4)", borderRadius: 8, borderLeft: `3px solid ${s.color}` }}>
          <div style={{ color: s.color, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{s.title}</div>
          {s.items.map((item, i) => (
            <div key={i} style={{ color: "#aabbcc", fontSize: 12, lineHeight: 1.8, paddingLeft: 12, position: "relative" }}>
              <span style={{ position: "absolute", left: 0, color: s.color }}>•</span>{item}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── 갭상승전략 상세 탭 ── */
function GapStrategyTab() {
  const sections = [
    { title: "1. 갭상승 종목 필터링", color: "#ffd54f", items: [
      "갭비율: 전일 종가 대비 시가 +2% ~ +15%",
      "거래량: 전일 평균 거래량 대비 200% 이상",
      "시가총액: 1,000억 이상 (잡주 제외)",
      "갭이 너무 크면(+15% 초과) 제외 — 급등주 추격 방지"] },
    { title: "2. 매수 타이밍 (5가지 신호)", color: "#4cff8b", items: [
      "✅ 필수: 갭비율 2~15% + 거래량 급증",
      "선택: 시가 지지 (시가 밑으로 안 빠짐)",
      "선택: 초기 눌림 후 반등 (고점 대비 1~3% 하락 후 양봉)",
      "선택: 호가창 매수 우세 (매수잔량 > 매도잔량 × 1.5)",
      "5개 중 필수 2개 포함 3개 이상 → 매수"] },
    { title: "3. 진입 가격 계산", color: "#64b5f6", items: [
      "기본: 현재가 (시장가 매수)",
      "갭 하단 지지: 시가 - (시가 × 0.5%)",
      "ATR 기반 스톱가 계산: 매수가 - (ATR × 1.0)"] },
    { title: "4. 익절 (빠른 트레일링 스톱)", color: "#ff9800", items: [
      "스톱가 = 최고점 - (ATR × 1.2) — 눌림목보다 타이트",
      "갭상승은 빠른 움직임 → 빠른 수익 확정이 핵심",
      "갭비율의 50% 수익 달성 시 스톱가 공격적으로 올림"] },
    { title: "5. 손절 (갭 기반 안전장치)", color: "#ff4444", items: [
      "1차: 시가(갭 하단) 이탈 시 즉시 손절",
      "2차: 매수가 대비 -2% (눌림목보다 타이트한 손절)",
      "갭을 메우는 방향으로 가면 → 전략 실패, 즉시 청산"] },
    { title: "6. 매매 시간", color: "#ce93d8", items: [
      "매수 가능: 09:05 ~ 09:25 (장 초반 5분은 변동성 회피)",
      "매도 가능: 09:05 ~ 09:35",
      "09:30 이후 보유종목 → 눌림목전략으로 이관 또는 청산"] }
  ];
  return (
    <div style={{ background: "linear-gradient(135deg,rgba(25,35,65,0.9),rgba(15,22,48,0.95))", border: "1px solid rgba(100,140,200,0.15)", borderRadius: 12, padding: 24 }}>
      <h2 style={{ color: "#e0e6f0", fontSize: 18, margin: "0 0 20px" }}>📈 갭상승전략 상세 (Gap-Up Strategy)</h2>
      {/* 핵심 요약 박스 */}
      <div style={{ background: "rgba(255,213,79,0.08)", border: "1px solid rgba(255,213,79,0.2)", borderRadius: 8, padding: 14, marginBottom: 20 }}>
        <div style={{ color: "#ffd54f", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>💡 전략 핵심</div>
        <div style={{ color: "#aabbcc", fontSize: 12, lineHeight: 1.7 }}>
          전일 종가 대비 +2% 이상 갭상승한 종목 중, 장 초반 9:00~9:30 시간대에 초기 눌림 후 반등하는 종목을 포착하여 매수합니다. 눌림목전략이 분봉 데이터를 축적하는 동안(09:00~09:30) 공백을 메우는 보완 전략입니다.
        </div>
      </div>
      {sections.map((s, idx) => (
        <div key={idx} style={{ marginBottom: 16, padding: 14, background: "rgba(10,18,40,0.4)", borderRadius: 8, borderLeft: `3px solid ${s.color}` }}>
          <div style={{ color: s.color, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{s.title}</div>
          {s.items.map((item, i) => (
            <div key={i} style={{ color: "#aabbcc", fontSize: 12, lineHeight: 1.8, paddingLeft: 12, position: "relative" }}>
              <span style={{ position: "absolute", left: 0, color: s.color }}>•</span>{item}
            </div>
          ))}
        </div>
      ))}

      {/* 눌림목 vs 갭상승 비교표 */}
      <div style={{ marginTop: 8, padding: 14, background: "rgba(10,18,40,0.4)", borderRadius: 8, borderLeft: "3px solid #64b5f6" }}>
        <div style={{ color: "#64b5f6", fontWeight: 600, fontSize: 14, marginBottom: 12 }}>📊 눌림목 vs 갭상승 비교</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(100,140,200,0.2)" }}>
              {["항목", "눌림목전략", "갭상승전략"].map(h => (
                <th key={h} style={{ padding: "8px 6px", color: "#6688aa", fontWeight: 600, textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["매매 시간", "09:30 ~ 15:00", "09:05 ~ 09:30"],
              ["매수 조건", "7가지 신호 중 4개+", "5가지 신호 중 3개+"],
              ["트레일링 ATR", "ATR × 2.0", "ATR × 1.2"],
              ["절대 손절", "-3%", "-2%"],
              ["목표 수익", "중기 (수시간)", "단기 (수십분)"],
              ["특징", "안정적, 데이터 기반", "빠른 판단, 모멘텀 활용"],
            ].map(([k, v1, v2], i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(100,140,200,0.08)" }}>
                <td style={{ padding: "8px 6px", color: "#6688aa" }}>{k}</td>
                <td style={{ padding: "8px 6px", color: "#4cff8b", fontFamily: "monospace" }}>{v1}</td>
                <td style={{ padding: "8px 6px", color: "#ffd54f", fontFamily: "monospace" }}>{v2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
