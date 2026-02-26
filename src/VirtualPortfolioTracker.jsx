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
  if (!pf) return null;

  const isActive = pf.status === 'active';
  const holdCount = positions.filter(p => p.status === 'holding').length;
  const winCount = pf.win_count || 0;
  const lossCount = pf.loss_count || 0;
  const winRate = (winCount + lossCount) > 0 ? Math.round((winCount / (winCount + lossCount)) * 100) : 0;
  const daysSince = pf.created_at ? Math.max(1, Math.round((Date.now() - new Date(pf.created_at).getTime()) / 86400000)) : 1;

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

          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1.5fr 70px 80px 80px 80px 80px 50px 90px',
              padding: '12px 16px', alignItems: 'center',
              borderBottom: `1px solid ${COLORS.cardBorder}`,
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.white }}>{pos.name}</div>
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
