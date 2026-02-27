/**
 * 실시간 가상투자 포트폴리오 추적
 * Virtual Portfolio Tracker
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 파일경로: src/pages/VirtualPortfolioTracker.jsx
 *
 * 매수추천 종목을 등록 → 날짜별 포트폴리오 관리 → 실시간 수익 추적
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = "https://web-production-139e9.up.railway.app";

const COLORS = {
  bg: '#0a0e1a', card: '#111827', cardBorder: '#1e293b',
  accent: '#3b82f6', accentDim: 'rgba(59,130,246,0.15)',
  green: '#10b981', greenDim: 'rgba(16,185,129,0.15)',
  red: '#ef4444', redDim: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b', yellowDim: 'rgba(245,158,11,0.15)',
  orange: '#ff9800', orangeDim: 'rgba(255,152,0,0.15)',
  purple: '#8b5cf6', purpleDim: 'rgba(139,92,246,0.15)',
  gray: '#6b7280', grayLight: '#9ca3af',
  text: '#e5e7eb', textDim: '#9ca3af', white: '#f9fafb',
};

const fmt = (n) => n?.toLocaleString() ?? '-';

const STATUS_MAP = {
  holding: { label: '보유중', color: COLORS.orange, bg: COLORS.orangeDim },
  profit: { label: '익절', color: COLORS.green, bg: COLORS.greenDim },
  trailing: { label: '추적익절', color: COLORS.green, bg: COLORS.greenDim },
  loss: { label: '손절', color: COLORS.red, bg: COLORS.redDim },
  timeout: { label: '만기', color: COLORS.gray, bg: 'rgba(107,114,128,0.15)' },
};

const STRATEGY_LABELS = {
  smart: '🧠 스마트형',
  aggressive: '🔥 공격형',
  balanced: '⚖️ 기본형',
};

const STRATEGY_PARAMS = {
  smart: {
    label: '🧠 스마트형',
    desc: '수익 활성화 후 추적손절 — 급등주 대응 전략',
    params: [
      { key: 'grace_days', label: '유예기간', value: 7, unit: '일', desc: '매수 후 청산 유예' },
      { key: 'stop_loss_pct', label: '손절선', value: 12.0, unit: '%', desc: '최대 허용 손실' },
      { key: 'profit_activation_pct', label: '수익 활성화', value: 15.0, unit: '%', desc: '추적손절 시작 조건' },
      { key: 'trailing_stop_pct', label: '추적손절', value: 5.0, unit: '%', desc: '고점 대비 하락 시 매도' },
      { key: 'max_hold_days', label: '최대보유', value: 30, unit: '일', desc: '자동 만기 청산' },
    ],
    flow: '매수 → 7일 유예 → 15% 수익 활성화 → 고점 대비 -5% 시 매도 / -12% 손절 / 30일 만기',
  },
  aggressive: {
    label: '🔥 공격형',
    desc: '빠른 익절/손절 — 단타 전략',
    params: [
      { key: 'take_profit_pct', label: '익절선', value: 10.0, unit: '%', desc: '목표 수익 도달 시 매도' },
      { key: 'stop_loss_pct', label: '손절선', value: 5.0, unit: '%', desc: '최대 허용 손실' },
      { key: 'max_hold_days', label: '최대보유', value: 5, unit: '일', desc: '자동 만기 청산' },
    ],
    flow: '매수 → +10% 익절 / -5% 손절 / 5일 만기',
  },
  balanced: {
    label: '⚖️ 기본형',
    desc: '균형 잡힌 익절/손절 — 중기 전략',
    params: [
      { key: 'take_profit_pct', label: '익절선', value: 7.0, unit: '%', desc: '목표 수익 도달 시 매도' },
      { key: 'stop_loss_pct', label: '손절선', value: 3.0, unit: '%', desc: '최대 허용 손실' },
      { key: 'max_hold_days', label: '최대보유', value: 10, unit: '일', desc: '자동 만기 청산' },
    ],
    flow: '매수 → +7% 익절 / -3% 손절 / 10일 만기',
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function VirtualPortfolioTracker() {
  const [view, setView] = useState('list');    // list | detail
  const [portfolios, setPortfolios] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  // ── 포트폴리오 목록 로드 ──
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/virtual-portfolio/list`);
      const data = await res.json();
      setPortfolios(data.portfolios || []);
    } catch (e) {
      console.error('목록 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 포트폴리오 상세 로드 ──
  const loadDetail = useCallback(async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/virtual-portfolio/detail/${id}`);
      const data = await res.json();
      setDetail(data);
      setSelectedId(id);
      setView('detail');
    } catch (e) {
      console.error('상세 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 가격 갱신 ──
  const handleUpdatePrices = async (id) => {
    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/api/virtual-portfolio/update-prices/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await loadDetail(id);
        await loadList();
      }
    } catch (e) {
      console.error('갱신 실패:', e);
    } finally {
      setUpdating(false);
    }
  };

  // ── 전체 청산 ──
  const handleClose = async (id) => {
    if (!window.confirm('이 포트폴리오를 청산하시겠습니까?\n보유 중인 모든 종목이 현재가에 매도됩니다.')) return;
    try {
      await fetch(`${API_BASE}/api/virtual-portfolio/close/${id}`, { method: 'POST' });
      await loadDetail(id);
      await loadList();
    } catch (e) {
      console.error('청산 실패:', e);
    }
  };

  // ── 삭제 ──
  const handleDelete = async (id) => {
    if (!window.confirm('이 포트폴리오를 영구 삭제하시겠습니까?')) return;
    try {
      await fetch(`${API_BASE}/api/virtual-portfolio/delete/${id}`, { method: 'DELETE' });
      setView('list');
      setDetail(null);
      await loadList();
    } catch (e) {
      console.error('삭제 실패:', e);
    }
  };

  useEffect(() => { loadList(); }, [loadList]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.white, margin: 0 }}>
            📊 실시간 가상투자 추적
          </h1>
          <p style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>
            매수추천 종목으로 가상 포트폴리오를 만들고 실시간으로 수익을 추적합니다
          </p>
        </div>
        {view === 'detail' && (
          <button onClick={() => setView('list')} style={{
            padding: '8px 18px', borderRadius: 8, border: `1px solid ${COLORS.cardBorder}`,
            background: COLORS.card, color: COLORS.text, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>← 목록으로</button>
        )}
      </div>

      {view === 'list' && <PortfolioList portfolios={portfolios} loading={loading} onSelect={loadDetail} onRefresh={loadList} />}
      {view === 'detail' && detail && (
        <PortfolioDetail
          detail={detail}
          updating={updating}
          onUpdate={() => handleUpdatePrices(selectedId)}
          onClose={() => handleClose(selectedId)}
          onDelete={() => handleDelete(selectedId)}
          onBack={() => setView('list')}
        />
      )}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 포트폴리오 목록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PortfolioList({ portfolios, loading, onSelect, onRefresh }) {
  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: COLORS.textDim }}>로딩 중...</div>;
  }

  if (portfolios.length === 0) {
    return (
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 14, padding: 60, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: COLORS.white }}>
          등록된 포트폴리오가 없습니다
        </h3>
        <p style={{ fontSize: 13, color: COLORS.textDim, lineHeight: 1.8 }}>
          패턴 분석 → 매수 추천 탭에서 종목을 선택하고<br />
          "가상투자 등록" 버튼을 눌러 포트폴리오를 생성하세요
        </p>
      </div>
    );
  }

  // 통계 요약
  const activeCount = portfolios.filter(p => p.status === 'active').length;
  const closedCount = portfolios.filter(p => p.status === 'closed').length;
  const totalProfit = portfolios.reduce((s, p) => s + (p.total_return_won || 0), 0);

  return (
    <div>
      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '전체', value: portfolios.length, unit: '개', color: COLORS.accent },
          { label: '추적중', value: activeCount, unit: '개', color: COLORS.green },
          { label: '종료', value: closedCount, unit: '개', color: COLORS.gray },
          { label: '총 수익', value: `${totalProfit >= 0 ? '+' : ''}${fmt(totalProfit)}원`, color: totalProfit >= 0 ? COLORS.red : COLORS.accent },
        ].map((s, i) => (
          <div key={i} style={{
            background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 10, padding: '14px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'JetBrains Mono, monospace' }}>
              {typeof s.value === 'number' ? s.value : s.value}
            </div>
            {s.unit && <div style={{ fontSize: 10, color: COLORS.textDim }}>{s.unit}</div>}
          </div>
        ))}
      </div>

      {/* 포트폴리오 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {portfolios.map(pf => {
          const isActive = pf.status === 'active';
          const isProfit = (pf.total_return_won || 0) >= 0;
          const pcts = pf.total_return_pct || 0;
          const datePart = pf.created_at ? pf.created_at.slice(5, 10).replace('-', '/') : '';
          const stocks = pf.positions_summary || [];

          return (
            <div key={pf.id} onClick={() => onSelect(pf.id)} style={{
              background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.accent + '60'; e.currentTarget.style.background = COLORS.accent + '08'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.cardBorder; e.currentTarget.style.background = COLORS.card; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                {/* 날짜 뱃지 */}
                <div style={{
                  background: isProfit ? COLORS.greenDim : COLORS.redDim,
                  color: isProfit ? COLORS.green : COLORS.red,
                  fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                  padding: '8px 12px', borderRadius: 8, minWidth: 60, textAlign: 'center',
                }}>{datePart}</div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>{pf.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                    {pf.stock_count}종목 · 투자금 {fmt(pf.capital)}원 · {STRATEGY_LABELS[pf.strategy] || pf.strategy}
                  </div>
                  {/* 종목 칩 */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {stocks.slice(0, 6).map((s, i) => (
                      <span key={i} style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: s.status === 'holding' ? COLORS.orangeDim : s.profit_pct > 0 ? COLORS.greenDim : COLORS.redDim,
                        color: s.status === 'holding' ? COLORS.orange : s.profit_pct > 0 ? COLORS.green : COLORS.red,
                      }}>{s.name}</span>
                    ))}
                    {stocks.length > 6 && <span style={{ fontSize: 10, color: COLORS.textDim }}>+{stocks.length - 6}</span>}
                  </div>
                </div>
              </div>

              {/* 수익 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 18, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                    color: isProfit ? COLORS.red : COLORS.accent,
                  }}>{isProfit ? '+' : ''}{pcts}%</div>
                  <div style={{
                    fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                    color: COLORS.textDim,
                  }}>{isProfit ? '+' : ''}{fmt(pf.total_return_won || 0)}원</div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                  background: isActive ? COLORS.greenDim : 'rgba(107,114,128,0.15)',
                  color: isActive ? COLORS.green : COLORS.gray,
                }}>{isActive ? '● 추적중' : '종료됨'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 포트폴리오 상세
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PortfolioDetail({ detail, updating, onUpdate, onClose, onDelete, onBack }) {
  const { portfolio: pf, positions } = detail;
  const [selectedCode, setSelectedCode] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  if (!pf) return null;

  const isActive = pf.status === 'active';
  const holdCount = positions.filter(p => p.status === 'holding').length;
  const winCount = pf.win_count || 0;
  const lossCount = pf.loss_count || 0;
  const winRate = (winCount + lossCount) > 0 ? Math.round((winCount / (winCount + lossCount)) * 100) : 0;
  const daysSince = pf.created_at ? Math.max(1, Math.round((Date.now() - new Date(pf.created_at).getTime()) / 86400000)) : 1;

  const handleStockClick = async (pos) => {
    if (selectedCode === pos.code) { setSelectedCode(null); setChartData(null); return; }
    setSelectedCode(pos.code);
    setChartLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/virtual-portfolio/candles/${pos.code}?days=130`);
      const data = await res.json();
      setChartData({ ...data, pos });
    } catch (e) {
      console.error('차트 로드 실패:', e);
      setChartData(null);
    } finally {
      setChartLoading(false);
    }
  };

  return (
    <div>
      {/* 헤더 */}
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 14, padding: 24, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: COLORS.white, margin: 0 }}>{pf.name}</h2>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
              등록: {pf.created_at?.slice(0, 16).replace('T', ' ')} · D+{daysSince}일 · {STRATEGY_LABELS[pf.strategy] || pf.strategy}
              {!isActive && ` · 종료: ${pf.closed_at?.slice(0, 10) || ''}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isActive && (
              <>
                <button onClick={onUpdate} disabled={updating} style={{
                  padding: '7px 16px', borderRadius: 8, border: `1px solid ${COLORS.accent}40`,
                  background: COLORS.accentDim, color: COLORS.accent, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, opacity: updating ? 0.5 : 1,
                }}>🔄 {updating ? '갱신 중...' : '가격 갱신'}</button>
                <button onClick={onClose} style={{
                  padding: '7px 16px', borderRadius: 8, border: `1px solid ${COLORS.red}40`,
                  background: COLORS.redDim, color: COLORS.red, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>전체 청산</button>
              </>
            )}
            <button onClick={onDelete} style={{
              padding: '7px 16px', borderRadius: 8, border: `1px solid ${COLORS.cardBorder}`,
              background: 'transparent', color: COLORS.textDim, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>🗑 삭제</button>
          </div>
        </div>

        {/* 요약 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { label: '투자원금', value: `${Math.round(pf.capital / 10000)}만`, color: COLORS.text },
            { label: '현재 평가', value: `${(pf.current_value / 10000).toFixed(1)}만`, color: (pf.total_return_won || 0) >= 0 ? COLORS.red : COLORS.accent, sub: `${(pf.total_return_won || 0) >= 0 ? '+' : ''}${fmt(pf.total_return_won || 0)}원` },
            { label: '총 수익률', value: `${(pf.total_return_pct || 0) >= 0 ? '+' : ''}${pf.total_return_pct || 0}%`, color: (pf.total_return_pct || 0) >= 0 ? COLORS.red : COLORS.accent, sub: `D+${daysSince}일` },
            { label: '승률', value: `${winCount}/${winCount + lossCount}`, color: COLORS.yellow, sub: `${winRate}%` },
            { label: '보유/전체', value: `${holdCount}/${positions.length}`, color: COLORS.orange, sub: isActive ? '추적중' : '종료' },
          ].map((s, i) => (
            <div key={i} style={{
              background: '#0d1321', border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 10, padding: '14px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* 매매 전략 설정 */}
      {(() => {
        const strat = STRATEGY_PARAMS[pf.strategy] || STRATEGY_PARAMS.smart;
        return (
          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 14, padding: '18px 22px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>⚙️ 매매 전략 설정</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                  background: COLORS.accentDim, color: COLORS.accent,
                }}>{strat.label}</span>
              </div>
              <span style={{ fontSize: 11, color: COLORS.textDim }}>{strat.desc}</span>
            </div>

            {/* 파라미터 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${strat.params.length}, 1fr)`, gap: 10, marginBottom: 14 }}>
              {strat.params.map((p, i) => (
                <div key={i} style={{
                  background: '#0d1321', border: `1px solid ${COLORS.cardBorder}`,
                  borderRadius: 10, padding: '12px 10px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 6 }}>{p.label}</div>
                  <div style={{
                    fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                    color: p.key.includes('loss') || p.key.includes('stop') ? COLORS.red :
                           p.key.includes('profit') || p.key.includes('take') ? COLORS.green :
                           p.key.includes('grace') ? COLORS.accent : COLORS.yellow,
                  }}>
                    {p.value}{p.unit === '%' ? '%' : ''}
                  </div>
                  <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 4 }}>
                    {p.unit !== '%' ? p.unit + ' · ' : ''}{p.desc}
                  </div>
                </div>
              ))}
            </div>

            {/* 매매 플로우 */}
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(59,130,246,0.06)', border: `1px solid rgba(59,130,246,0.15)`,
              fontSize: 12, color: COLORS.accent, lineHeight: 1.6,
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              📋 {strat.flow}
            </div>
          </div>
        );
      })()}

      {/* 종목 테이블 */}
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* 테이블 헤더 */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.5fr 70px 80px 80px 80px 80px 50px 90px',
          padding: '12px 16px', fontSize: 11, color: COLORS.textDim, fontWeight: 600,
          background: '#0d1321', borderBottom: `1px solid ${COLORS.cardBorder}`,
        }}>
          <span>종목</span>
          <span style={{ textAlign: 'center' }}>상태</span>
          <span style={{ textAlign: 'right' }}>매수가</span>
          <span style={{ textAlign: 'right' }}>현재가</span>
          <span style={{ textAlign: 'right' }}>수익률</span>
          <span style={{ textAlign: 'right' }}>수익금</span>
          <span style={{ textAlign: 'center' }}>일수</span>
          <span style={{ textAlign: 'center' }}>추이</span>
        </div>

        {/* 종목 행 */}
        {positions.map((pos, i) => {
          const st = STATUS_MAP[pos.status] || STATUS_MAP.holding;
          const isProfit = (pos.profit_pct || 0) >= 0;
          const profitColor = isProfit ? COLORS.red : COLORS.accent;
          const history = Array.isArray(pos.price_history) ? pos.price_history : [];
          const isSelected = selectedCode === pos.code;

          return (
            <React.Fragment key={i}>
              <div onClick={() => handleStockClick(pos)} style={{
                display: 'grid', gridTemplateColumns: '1.5fr 70px 80px 80px 80px 80px 50px 90px',
                padding: '12px 16px', alignItems: 'center',
                borderBottom: `1px solid ${COLORS.cardBorder}`,
                background: isSelected ? 'rgba(59,130,246,0.08)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                cursor: 'pointer', transition: 'background 0.15s',
                borderLeft: isSelected ? `3px solid ${COLORS.accent}` : '3px solid transparent',
              }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(59,130,246,0.04)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'; }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.white }}>
                    {isSelected ? '▼ ' : '▶ '}{pos.name}
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textDim, fontFamily: 'JetBrains Mono, monospace' }}>{pos.code}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                    background: st.bg, color: st.color,
                  }}>{st.label}</span>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: COLORS.text }}>
                  {fmt(pos.buy_price)}
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: profitColor }}>
                  {fmt(pos.status === 'holding' ? pos.current_price : pos.sell_price || pos.current_price)}
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: profitColor }}>
                  {isProfit ? '+' : ''}{pos.profit_pct || 0}%
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: profitColor }}>
                  {isProfit ? '+' : ''}{fmt(pos.profit_won || 0)}
                </div>
                <div style={{ textAlign: 'center', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: COLORS.textDim }}>
                  {pos.hold_days || 0}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <MiniSparkline data={history} />
                </div>
              </div>

              {/* ━━━ 차트 패널 ━━━ */}
              {isSelected && (
                <div style={{
                  padding: '20px 16px', borderBottom: `1px solid ${COLORS.cardBorder}`,
                  background: 'rgba(8,15,30,0.6)',
                }}>
                  {chartLoading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: COLORS.textDim, fontSize: 13 }}>
                      📊 {pos.name} 차트 로딩 중...
                    </div>
                  ) : chartData && chartData.candles && chartData.candles.length > 0 ? (
                    <StockCandleChart
                      candles={chartData.candles}
                      pos={pos}
                      buyDate={pos.buy_date ? new Date(pos.buy_date).toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'}) : null}
                      buyPrice={pos.buy_price}
                      sellDate={pos.sell_date ? new Date(pos.sell_date).toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'}) : null}
                      sellPrice={pos.sell_price}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 30, color: COLORS.textDim, fontSize: 12 }}>
                      차트 데이터를 불러올 수 없습니다
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* 일별 자산 추이 */}
      {positions.length > 0 && <EquityCurve positions={positions} capital={pf.capital} />}
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 미니 스파크라인 차트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MiniSparkline({ data }) {
  if (!data || data.length < 2) {
    return <span style={{ fontSize: 10, color: COLORS.textDim }}>—</span>;
  }

  const closes = data.map(d => d.close).filter(c => c > 0);
  if (closes.length < 2) return <span style={{ fontSize: 10, color: COLORS.textDim }}>—</span>;

  const W = 80, H = 28;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const points = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * W;
    const y = H - ((c - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const isUp = closes[closes.length - 1] >= closes[0];

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={points} fill="none"
        stroke={isUp ? COLORS.red : COLORS.accent}
        strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 일별 자산 추이 차트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function EquityCurve({ positions, capital }) {
  // 모든 포지션의 price_history에서 날짜별 합산
  const dateMap = {};
  positions.forEach(pos => {
    const history = Array.isArray(pos.price_history) ? pos.price_history : [];
    history.forEach(h => {
      if (!dateMap[h.date]) dateMap[h.date] = 0;
      dateMap[h.date] += (h.close || 0) * (pos.quantity || 0);
    });
  });

  const dates = Object.keys(dateMap).sort();
  if (dates.length < 2) return null;

  const values = dates.map(d => dateMap[d]);
  const returns = values.map(v => ((v - capital) / capital) * 100);

  const W = 600, H = 140, PAD = 40;
  const plotW = W - PAD * 2, plotH = H - 30;
  const maxR = Math.max(...returns.map(Math.abs), 1);

  const toX = (i) => PAD + (i / (returns.length - 1)) * plotW;
  const toY = (r) => 15 + (1 - (r + maxR) / (2 * maxR)) * plotH;

  const pathD = returns.map((r, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(r).toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${toX(returns.length - 1).toFixed(1)},${toY(0).toFixed(1)} L${toX(0).toFixed(1)},${toY(0).toFixed(1)} Z`;

  const lastReturn = returns[returns.length - 1];
  const lineColor = lastReturn >= 0 ? COLORS.red : COLORS.accent;

  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
      borderRadius: 14, padding: 20, marginTop: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textDim, marginBottom: 12 }}>
        📈 일별 수익률 추이
      </div>
      <svg width={W} height={H} style={{ display: 'block', maxWidth: '100%' }}>
        {/* 기준선 */}
        <line x1={PAD} y1={toY(0)} x2={PAD + plotW} y2={toY(0)}
          stroke={COLORS.cardBorder} strokeWidth={1} strokeDasharray="4,4" />
        <text x={PAD - 4} y={toY(0) + 4} fontSize={9} fill={COLORS.textDim} textAnchor="end">0%</text>

        {/* 영역 */}
        <path d={areaD} fill={lineColor} opacity={0.08} />

        {/* 라인 */}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2} />

        {/* 마지막 점 */}
        <circle cx={toX(returns.length - 1)} cy={toY(lastReturn)} r={4} fill={lineColor} />
        <text x={toX(returns.length - 1) + 8} y={toY(lastReturn) + 4}
          fontSize={11} fill={lineColor} fontWeight={700} fontFamily="JetBrains Mono, monospace">
          {lastReturn >= 0 ? '+' : ''}{lastReturn.toFixed(1)}%
        </text>

        {/* 날짜 라벨 */}
        {dates.filter((_, i) => i === 0 || i === dates.length - 1 || i % Math.ceil(dates.length / 5) === 0).map((d, i) => {
          const idx = dates.indexOf(d);
          return (
            <text key={i} x={toX(idx)} y={H - 2} fontSize={9} fill={COLORS.textDim} textAnchor="middle">
              {d.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 종목 상세 캔들 차트 v3 (전체비교실행 TradeCandleChart 완전 동일)
// - 오늘 이전 90일 전체 표시
// - DTW 패턴 감지 구간 (보라색 수직 점선 + 보라 하단바)
// - 매매 구간 (하늘색 영역)
// - 매수/매도 마커 (가격 + 수직선 + 배경)
// - MA5(노란), MA20(핑크) 이동평균선
// - 현재가 빨간 가격태그 (우측)
// - 매수가 녹색 가격태그 (우측)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StockCandleChart({ candles, pos, buyDate, buyPrice, sellDate, sellPrice }) {
  if (!candles || candles.length < 5) return null;

  // ── 날짜 유틸 ──
  const norm = (d) => d ? d.replace(/-/g, '').trim() : '';
  const fDate = (d) => { const s = norm(d); return s.length >= 8 ? `${s.slice(4,6)}/${s.slice(6,8)}` : d || '-'; };
  const fDateFull = (d) => { const s = norm(d); return s.length >= 8 ? `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}` : d || '-'; };

  // ── 전체 90일 표시 (윈도우 없이 전체 캔들 사용) ──
  const MAX_CANDLES = 90;
  const vis = candles.length > MAX_CANDLES ? candles.slice(candles.length - MAX_CANDLES) : [...candles];
  const offsetIdx = candles.length > MAX_CANDLES ? candles.length - MAX_CANDLES : 0;
  if (vis.length < 5) return null;

  // ── 매수/매도 인덱스 찾기 (날짜 → 가격 → 인덱스 순서로 폴백) ──
  const buyDateN = norm(buyDate);
  const sellDateN = norm(sellDate);
  let buyIdx = -1, sellIdx = -1;

  // 원본 candles에서 인덱스 찾은 뒤 vis 인덱스로 변환
  if (buyDateN) {
    let gi = candles.findIndex(c => norm(c.date) === buyDateN);
    if (gi < 0) gi = candles.findIndex(c => norm(c.date) >= buyDateN);
    if (gi >= offsetIdx) buyIdx = gi - offsetIdx;
  }
  if (sellDateN) {
    let gi = candles.findIndex(c => norm(c.date) === sellDateN);
    if (gi < 0) gi = candles.findIndex(c => norm(c.date) >= sellDateN);
    if (gi >= offsetIdx) sellIdx = gi - offsetIdx;
  }

  // 날짜 없으면 → 매수가에 가장 가까운 종가 (후반 60%에서)
  if (buyIdx < 0 && buyPrice > 0) {
    const searchFrom = Math.floor(vis.length * 0.3);
    let minDiff = Infinity;
    for (let i = searchFrom; i < vis.length; i++) {
      const diff = Math.abs(vis[i].close - buyPrice);
      if (diff < minDiff) { minDiff = diff; buyIdx = i; }
      if (diff === 0) break;
    }
  }

  // 매도 인덱스 = 매수 + 보유일수
  if (sellIdx < 0 && buyIdx >= 0 && pos.hold_days > 0 && pos.status !== 'holding') {
    sellIdx = Math.min(buyIdx + pos.hold_days, vis.length - 1);
  }

  // 오늘 매수인데 캔들 아직 없으면 마지막에 표시
  if (buyIdx < 0 && buyDateN && vis.length > 0 && buyDateN > norm(vis[vis.length - 1].date)) {
    buyIdx = vis.length - 1;
  }
  if (sellIdx < 0 && sellDateN && vis.length > 0 && sellDateN > norm(vis[vis.length - 1].date)) {
    sellIdx = vis.length - 1;
  }

  // ── 차트 사이즈 (전체비교실행과 동일) ──
  const W = 780, H_CHART = 280, H_VOL = 55, GAP = 20;
  const PAD = { t: 28, b: 40, l: 62, r: 80 };
  const TOTAL_H = PAD.t + H_CHART + GAP + H_VOL + PAD.b;
  const plotW = W - PAD.l - PAD.r;
  const cw = plotW / vis.length;

  // ── 가격 범위 (8% 패딩) ──
  const allP = vis.flatMap(c => [c.high, c.low]).filter(p => p > 0);
  const pMin = Math.min(...allP), pMax = Math.max(...allP);
  const pPad = (pMax - pMin) * 0.08 || 100;
  const pLow = pMin - pPad, pHigh = pMax + pPad, pRange = pHigh - pLow || 1;
  const maxVol = Math.max(...vis.map(c => c.volume || 0), 1);

  const toX = (i) => PAD.l + i * cw;
  const toY = (p) => PAD.t + (1 - (p - pLow) / pRange) * H_CHART;
  const volBase = PAD.t + H_CHART + GAP + H_VOL;

  // ── 이동평균선 계산 (원본 candles 기준 → vis에 투영) ──
  const calcMA = (period) => {
    return vis.map((_, i) => {
      const gi = offsetIdx + i;
      if (gi < period - 1) return null;
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[gi - j].close;
      return sum / period;
    });
  };
  const ma5 = calcMA(5);
  const ma20 = calcMA(20);

  // ── 수익률/상태 ──
  const profitPct = pos?.profit_pct || 0;
  const profitColor = profitPct >= 0 ? '#ff5252' : '#4488ff';
  const statusLabel = pos.status === 'profit' ? '익절' : pos.status === 'trailing' ? '추적' : pos.status === 'loss' ? '손절' : pos.status === 'timeout' ? '만기' : '';

  const svg = [];

  // ── 배경 ──
  svg.push(<rect key="bg" x={0} y={0} width={W} height={TOTAL_H} fill="rgba(8,15,30,0.95)" rx={8} />);

  // ── DTW 패턴 감지 구간 (매수 30일 전 ~ 매수일) ──
  if (buyIdx >= 0) {
    const dtwStart = Math.max(0, buyIdx - 30);
    const dtwEnd = buyIdx;
    const dx1 = toX(dtwStart);
    const dx2 = toX(dtwEnd) + cw;
    // 보라색 배경
    svg.push(<rect key="dtw-bg" x={dx1} y={PAD.t} width={dx2 - dx1} height={H_CHART}
      fill="rgba(206,147,216,0.04)" />);
    // 좌우 수직 점선 (녹색)
    svg.push(<line key="dtw-vl" x1={dx1} y1={PAD.t} x2={dx1} y2={PAD.t + H_CHART}
      stroke="rgba(76,255,139,0.3)" strokeWidth={1} strokeDasharray="5,4" />);
    svg.push(<line key="dtw-vr" x1={dx2} y1={PAD.t} x2={dx2} y2={PAD.t + H_CHART}
      stroke="rgba(76,255,139,0.3)" strokeWidth={1} strokeDasharray="5,4" />);
    // 하단 보라색 바
    svg.push(<rect key="dtw-bar" x={dx1} y={PAD.t + H_CHART - 6} width={dx2 - dx1} height={6}
      fill="rgba(206,147,216,0.45)" rx={2} />);
    // 상단 라벨
    svg.push(<text key="dtw-lbl" x={(dx1 + dx2) / 2} y={PAD.t + 14} fill="rgba(206,147,216,0.6)" fontSize={10}
      fontFamily="sans-serif" textAnchor="middle">DTW 패턴 감지 구간</text>);
  }

  // ── 매매 구간 하이라이트 (하늘색) ──
  if (buyIdx >= 0) {
    const hStart = toX(buyIdx);
    const hEnd = sellIdx >= 0 ? toX(sellIdx) + cw : toX(Math.min(buyIdx + (pos.hold_days || 5), vis.length - 1)) + cw;
    svg.push(<rect key="zone" x={hStart} y={PAD.t} width={Math.max(hEnd - hStart, cw)} height={H_CHART}
      fill="rgba(79,195,247,0.06)" stroke="rgba(79,195,247,0.2)" strokeDasharray="4,4" rx={2} />);
    svg.push(<text key="zone-lbl" x={(hStart + hEnd) / 2} y={PAD.t + H_CHART - 10} fill="rgba(79,195,247,0.5)" fontSize={10}
      fontFamily="sans-serif" textAnchor="middle">매매 구간</text>);
  }

  // ── 가격 눈금 (6단계) ──
  for (let i = 0; i <= 5; i++) {
    const p = pLow + pRange * (i / 5);
    const y = toY(p);
    svg.push(<line key={`pg-${i}`} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(50,70,100,0.25)" strokeDasharray="3,3" />);
    svg.push(<text key={`pl-${i}`} x={PAD.l - 8} y={y + 4} fill="#c8d0e0" fontSize={11}
      fontFamily="JetBrains Mono, monospace" textAnchor="end" fontWeight={500}>{Math.round(p).toLocaleString()}</text>);
  }

  // ── X축 날짜 라벨 ──
  const dateStep = Math.max(1, Math.floor(vis.length / 14));
  vis.forEach((c, i) => {
    const isBuy = i === buyIdx;
    const isSell = i === sellIdx;
    if (i % dateStep === 0 || isBuy || isSell) {
      const x = toX(i) + cw / 2;
      svg.push(<text key={`dt-${i}`} x={x} y={TOTAL_H - 6}
        fill={isBuy ? '#4cff8b' : isSell ? '#ffd54f' : '#8899aa'} fontSize={isBuy || isSell ? 11 : 9}
        fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight={isBuy || isSell ? 700 : 400}>{fDate(c.date)}</text>);
    }
  });

  // ── 거래량 구분선 + 라벨 ──
  svg.push(<line key="vol-sep" x1={PAD.l} y1={PAD.t + H_CHART + GAP / 2} x2={W - PAD.r} y2={PAD.t + H_CHART + GAP / 2}
    stroke="rgba(50,70,100,0.3)" />);
  svg.push(<text key="vol-lbl" x={PAD.l - 8} y={volBase - H_VOL + 12} fill="#556677" fontSize={9} fontFamily="monospace" textAnchor="end">VOL</text>);

  // ── 거래량 바 ──
  vis.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? '#ff4444' : '#4488ff';
    const barH = Math.max(((c.volume || 0) / maxVol) * H_VOL, 1);
    svg.push(<rect key={`vol-${i}`} x={x + 1} y={volBase - barH}
      width={Math.max(cw - 2, 2)} height={barH} fill={color} opacity={0.3} rx={1} />);
  });

  // ── 캔들 ──
  vis.forEach((c, i) => {
    const x = toX(i);
    const isUp = c.close >= c.open;
    const color = isUp ? '#ff4444' : '#4488ff';
    const bodyTop = toY(Math.max(c.open, c.close));
    const bodyBot = toY(Math.min(c.open, c.close));
    const bodyH = Math.max(bodyBot - bodyTop, 1.5);
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

  // ── 매수가 수평선 + 우측 가격태그 (녹색) ──
  if (buyPrice > 0 && buyPrice >= pLow && buyPrice <= pHigh) {
    const bpY = toY(buyPrice);
    svg.push(<line key="bp-line" x1={PAD.l} y1={bpY} x2={W - PAD.r} y2={bpY}
      stroke="#4cff8b" strokeWidth={1} strokeDasharray="8,4" opacity={0.3} />);
    // 우측 녹색 가격 태그
    svg.push(<rect key="bp-tag-bg" x={W - PAD.r + 2} y={bpY - 10} width={PAD.r - 6} height={20}
      fill="rgba(76,255,139,0.2)" stroke="rgba(76,255,139,0.4)" strokeWidth={0.5} rx={3} />);
    svg.push(<text key="bp-tag" x={W - PAD.r / 2 + 1} y={bpY + 4} fill="#4cff8b" fontSize={10}
      fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight={600}>{Math.round(buyPrice).toLocaleString()}</text>);
  }

  // ── 현재가/매도가 수평선 + 우측 가격태그 ──
  const endPrice = (pos.status !== 'holding' && (pos.sell_price || sellPrice))
    ? (pos.sell_price || sellPrice)
    : vis[vis.length - 1].close;
  const endY = toY(endPrice);
  const endColor = profitPct >= 0 ? '#ff4444' : '#4488ff';
  svg.push(<line key="cur-line" x1={PAD.l} y1={endY} x2={W - PAD.r} y2={endY}
    stroke={endColor} strokeWidth={1} strokeDasharray="5,3" opacity={0.5} />);
  // 우측 가격 태그
  svg.push(<rect key="cur-bg" x={W - PAD.r + 2} y={endY - 10} width={PAD.r - 6} height={20}
    fill={endColor} rx={3} />);
  svg.push(<text key="cur-txt" x={W - PAD.r / 2 + 1} y={endY + 4} fill="white" fontSize={10}
    fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight={600}>{Math.round(endPrice).toLocaleString()}</text>);

  // ── 목표가(익절가) 수평선 + 태그 (노란색, 수익 활성화 기준) ──
  if (buyPrice > 0) {
    const targetPct = pos.strategy === 'aggressive' ? 10 : pos.strategy === 'balanced' ? 7 : 15;
    const targetPrice = Math.round(buyPrice * (1 + targetPct / 100));
    if (targetPrice >= pLow && targetPrice <= pHigh && targetPrice !== Math.round(buyPrice)) {
      const tpY = toY(targetPrice);
      svg.push(<line key="tp-line" x1={PAD.l} y1={tpY} x2={W - PAD.r} y2={tpY}
        stroke="#ffd54f" strokeWidth={1} strokeDasharray="6,3" opacity={0.4} />);
      svg.push(<rect key="tp-bg" x={W - PAD.r + 2} y={tpY - 10} width={PAD.r - 6} height={20}
        fill="rgba(255,213,79,0.25)" stroke="rgba(255,213,79,0.5)" strokeWidth={0.5} rx={3} />);
      svg.push(<text key="tp-txt" x={W - PAD.r / 2 + 1} y={tpY + 4} fill="#ffd54f" fontSize={10}
        fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight={600}>{targetPrice.toLocaleString()}</text>);
    }
  }

  // ── 매수 마커 (▲ 녹색 + 가격 + 수직선) ──
  if (buyIdx >= 0 && buyIdx < vis.length) {
    const bx = toX(buyIdx) + cw / 2;
    const by = toY(vis[buyIdx].low) + 18;
    svg.push(
      <g key="buy-m">
        <line x1={bx} y1={PAD.t} x2={bx} y2={PAD.t + H_CHART} stroke="#4cff8b" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        <polygon points={`${bx},${by - 14} ${bx - 8},${by} ${bx + 8},${by}`} fill="#4cff8b" />
        <rect x={bx - 44} y={by + 4} width={88} height={18} fill="rgba(76,255,139,0.15)" stroke="rgba(76,255,139,0.3)" strokeWidth={0.5} rx={4} />
        <text x={bx} y={by + 16} fill="#4cff8b" fontSize={11} fontFamily="sans-serif" textAnchor="middle" fontWeight={700}>
          매수 {Math.round(buyPrice).toLocaleString()}
        </text>
      </g>
    );
  }

  // ── 매도 마커 (▼ + 익절/손절/추적/만기 + 가격 + 수직선) ──
  if (sellIdx >= 0 && sellIdx < vis.length) {
    const sx = toX(sellIdx) + cw / 2;
    const sy = toY(vis[sellIdx].high) - 8;
    const sellColor = profitPct >= 0 ? '#ffd54f' : '#4488ff';
    const sellBgColor = profitPct >= 0 ? 'rgba(255,213,79,0.2)' : 'rgba(68,136,255,0.2)';
    svg.push(
      <g key="sell-m">
        <line x1={sx} y1={PAD.t} x2={sx} y2={PAD.t + H_CHART} stroke={sellColor} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
        <polygon points={`${sx},${sy + 14} ${sx - 8},${sy} ${sx + 8},${sy}`} fill={sellColor} />
        <rect x={sx - 44} y={sy - 22} width={88} height={18} fill={sellBgColor} stroke={`${sellColor}50`} strokeWidth={0.5} rx={4} />
        <text x={sx} y={sy - 9} fill={sellColor} fontSize={11} fontFamily="sans-serif" textAnchor="middle" fontWeight={700}>
          {statusLabel} {Math.round(sellPrice || pos.sell_price || pos.current_price).toLocaleString()}
        </text>
      </g>
    );
  }

  // ── 헤더 (전체비교실행과 동일) ──
  const profitSign = profitPct >= 0 ? '+' : '';
  const headerBuyDate = buyIdx >= 0 ? fDateFull(vis[buyIdx].date) : fDateFull(buyDate) || '-';
  const headerSellDate = sellIdx >= 0 ? fDateFull(vis[sellIdx].date) : (pos.status !== 'holding' ? fDateFull(sellDate) || '-' : '보유중');

  return (
    <div>
      {/* 헤더: 전체비교실행과 완전 동일 형식 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          <span style={{ color: '#e0e6f0' }}>📊 {pos.name}</span>
          <span style={{ color: '#6688aa', fontSize: 11, marginLeft: 8 }}>({pos.code})</span>
          <span style={{ color: '#4cff8b', fontSize: 11, marginLeft: 12, padding: '2px 6px', background: 'rgba(76,255,139,0.1)', borderRadius: 4 }}>
            매수 {headerBuyDate}
          </span>
          <span style={{ color: '#8899aa', fontSize: 11, marginLeft: 6 }}>→</span>
          <span style={{ color: profitColor, fontSize: 11, marginLeft: 6, padding: '2px 6px', background: `${profitColor}15`, borderRadius: 4 }}>
            {pos.status === 'holding' ? `보유중 D+${pos.hold_days || 0}` : `매도 ${headerSellDate}`}
          </span>
          <span style={{ color: profitColor, fontSize: 12, marginLeft: 10, fontWeight: 700 }}>
            {profitSign}{profitPct}% ({pos.hold_days || 0}일)
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, flexWrap: 'wrap' }}>
          <span><span style={{ color: '#ff4444' }}>■</span> 양봉</span>
          <span><span style={{ color: '#4488ff' }}>■</span> 음봉</span>
          <span style={{ color: '#ffcc00' }}>── MA5</span>
          <span style={{ color: '#ff6699' }}>── MA20</span>
        </div>
      </div>

      <svg width={W} height={TOTAL_H} style={{ display: 'block', maxWidth: '100%' }}>
        {svg}
      </svg>

      {/* 종목 정보 바 (전체비교실행 동일) */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 10, padding: '8px 14px',
        background: 'rgba(15,22,42,0.6)', borderRadius: 8, fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace', border: '1px solid rgba(50,70,100,0.2)',
      }}>
        <span><span style={{ color: '#556677' }}>매수가 </span><span style={{ color: '#4cff8b' }}>{fmt(pos.buy_price)}</span></span>
        <span><span style={{ color: '#556677' }}>현재가 </span><span style={{ color: profitColor }}>{fmt(pos.current_price)}</span></span>
        <span><span style={{ color: '#556677' }}>최고가 </span><span style={{ color: '#ffd54f' }}>{fmt(pos.peak_price)}</span></span>
        <span><span style={{ color: '#556677' }}>수익률 </span><span style={{ color: profitColor }}>{profitPct >= 0 ? '+' : ''}{profitPct}%</span></span>
        <span><span style={{ color: '#556677' }}>보유일 </span><span style={{ color: COLORS.text }}>{pos.hold_days || 0}일</span></span>
        <span><span style={{ color: '#556677' }}>유사도 </span><span style={{ color: '#4fc3f7' }}>{pos.similarity || 0}%</span></span>
      </div>
    </div>
  );
}
