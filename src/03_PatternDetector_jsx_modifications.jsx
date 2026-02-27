/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  PatternDetector.jsx 수정 가이드
 *  PatternDetector.jsx Modification Guide
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  변경 사항 3개:
 *  [변경 A] 분석기 상태에 이전 결과 관련 state 추가
 *  [변경 B] 분석기 모드 진입 시 이전 결과 자동 로드 useEffect 추가
 *  [변경 C] 분석기 UI에 "이전 분석 결과" 카드 추가
 */


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [변경 A] state 추가 — 기존 "분석기 상태" 섹션에 추가
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 기존 코드:
//   const [analyzing, setAnalyzing] = useState(false);
//   const [progress, setProgress] = useState(0);
//   ...
//
// 그 아래에 추가:

  const [prevSessions, setPrevSessions] = useState([]);    // 이전 분석 세션 목록
  const [loadingPrevAnalysis, setLoadingPrevAnalysis] = useState(false);  // 이전 결과 로딩중
  const [prevAnalysisSource, setPrevAnalysisSource] = useState('');  // 결과 출처 표시


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [변경 B] useEffect 추가 — 분석기 모드 진입 시 이전 결과 로드
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 기존 스캐너 useEffect 아래에 추가:

  // ── 분석기 모드 진입 시 이전 결과 목록 로드 ──
  useEffect(() => {
    if (pageMode !== 'analyzer') return;

    let cancelled = false;

    (async () => {
      try {
        // 1) 먼저 메모리에 진행 중인 분석이 있는지 확인
        const progResp = await fetch(`${API_BASE}/api/pattern/progress`);
        const progData = await progResp.json();

        if (cancelled) return;

        if (progData.running) {
          // 분석 진행 중 → 폴링 재개
          setAnalyzing(true);
          setProgress(progData.progress || 0);
          setProgressMsg(progData.message || '분석 진행 중...');
          pollProgress();
          return;
        }

        // 메모리에 결과가 있으면 (방금 완료된 것) 먼저 표시
        if (!progData.running && progData.has_result && !result) {
          try {
            const resResp = await fetch(`${API_BASE}/api/pattern/result`);
            const resData = await resResp.json();
            if (!cancelled && resData.status === 'done') {
              setResult(resData);
              setActiveTab(0);
              setPrevAnalysisSource('memory');
            }
          } catch (e) { /* ignore */ }
        }

        // 2) DB에서 이전 세션 목록 로드
        const prevResp = await fetch(`${API_BASE}/api/pattern/previous`);
        const prevData = await prevResp.json();
        if (!cancelled && prevData.status === 'ok') {
          setPrevSessions(prevData.sessions || []);
        }
      } catch (e) {
        console.error('이전 분석 결과 로드 실패:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [pageMode]);


  // ── 이전 분석 결과 상세 로드 함수 ──
  const loadPreviousAnalysis = async (sessionId) => {
    setLoadingPrevAnalysis(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/api/pattern/previous/${sessionId}`);
      const data = await resp.json();

      if (data.status === 'done') {
        setResult(data);
        setActiveTab(0);
        setPrevAnalysisSource(`db_${sessionId}`);

        // 종목 목록도 복원
        if (data.stock_names) {
          const restoredStocks = Object.entries(data.stock_names).map(([code, name]) => ({
            code, name
          }));
          setStocks(restoredStocks);
        }

        // 프리셋 복원
        if (data.preset && PRESETS[data.preset]) {
          setActivePreset(data.preset);
        }
      } else {
        setError(data.message || '결과를 불러올 수 없습니다.');
      }
    } catch (e) {
      setError('이전 결과 로드 실패: ' + e.message);
    } finally {
      setLoadingPrevAnalysis(false);
    }
  };


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [변경 C] UI 추가 — 분석기 페이지 (pageMode === 'analyzer') 섹션
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 기존 분석기 섹션에서 "프리셋" 버튼들 바로 위에 추가합니다.
// 즉, {pageMode === 'analyzer' && (<div> 바로 안쪽 첫 번째 요소로 넣습니다.
//
// 아래 JSX를 추가:

        {/* ── 이전 분석 결과 로드 카드 ── */}
        {prevSessions.length > 0 && !result && !analyzing && (
          <div style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>이전 분석 결과</span>
                <span style={{
                  fontSize: 11, background: COLORS.accentDim, color: COLORS.accent,
                  padding: '2px 8px', borderRadius: 10,
                }}>최근 {prevSessions.length}건</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {prevSessions.slice(0, 5).map((session) => {
                const dt = new Date(session.created_at);
                const timeStr = dt.toLocaleString('ko-KR', {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                });
                const presetLabel = session.preset === 'bluechip' ? '🏢 우량주'
                  : session.preset === 'manipulation' ? '⚡ 작전주'
                  : '🔧 사용자정의';
                const stockNames = session.stock_names
                  ? Object.values(session.stock_names).slice(0, 3).join(', ')
                    + (Object.keys(session.stock_names).length > 3
                      ? ` 외 ${Object.keys(session.stock_names).length - 3}개` : '')
                  : `${session.stock_count}종목`;
                const summary = session.result_summary || {};

                return (
                  <button
                    key={session.id}
                    onClick={() => loadPreviousAnalysis(session.id)}
                    disabled={loadingPrevAnalysis}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'rgba(59,130,246,0.06)',
                      border: '1px solid rgba(59,130,246,0.15)',
                      borderRadius: 10,
                      padding: '12px 16px',
                      cursor: loadingPrevAnalysis ? 'wait' : 'pointer',
                      transition: 'all 0.2s',
                      width: '100%',
                      textAlign: 'left',
                      color: COLORS.text,
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59,130,246,0.12)';
                      e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(59,130,246,0.06)';
                      e.currentTarget.style.borderColor = 'rgba(59,130,246,0.15)';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: COLORS.accent, fontWeight: 600 }}>
                          {timeStr}
                        </span>
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 6,
                          background: session.preset === 'manipulation' ? COLORS.redDim : COLORS.accentDim,
                          color: session.preset === 'manipulation' ? COLORS.red : COLORS.accent,
                        }}>{presetLabel}</span>
                      </div>
                      <div style={{ fontSize: 13, color: COLORS.textDim }}>
                        {stockNames}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 12, color: COLORS.grayLight }}>
                        {summary.pattern_count || session.pattern_count || 0}개 패턴
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.gray }}>
                        {session.stock_count}종목
                      </div>
                    </div>

                    <div style={{
                      marginLeft: 12, fontSize: 16, color: COLORS.accent,
                    }}>▶</div>
                  </button>
                );
              })}
            </div>

            {loadingPrevAnalysis && (
              <div style={{
                textAlign: 'center', padding: '12px 0', marginTop: 8,
                fontSize: 13, color: COLORS.accent,
              }}>
                ⏳ 이전 결과 불러오는 중...
              </div>
            )}
          </div>
        )}

        {/* ── 현재 결과 출처 표시 (DB에서 불러온 경우) ── */}
        {result && prevAnalysisSource.startsWith('db_') && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 12,
            fontSize: 13,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📋</span>
              <span style={{ color: COLORS.yellow }}>이전 분석 결과를 보고 있습니다</span>
            </div>
            <button
              onClick={() => {
                setResult(null);
                setPrevAnalysisSource('');
              }}
              style={{
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 8,
                padding: '4px 12px',
                color: COLORS.yellow,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >✕ 닫기</button>
          </div>
        )}
