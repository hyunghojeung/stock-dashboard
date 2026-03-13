/**
 * 매매 일지 (Trade Journal)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 투자모드별(가상/모의/실전) 매수·매도 거래 내역을 시간순으로 기록·조회
 * Supabase trade_journal 테이블 사용
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const COLORS = {
  bg: '#0a0e1a', card: '#111827', cardBorder: '#1e293b',
  accent: '#3b82f6', accentDim: 'rgba(59,130,246,0.15)',
  green: '#10b981', greenDim: 'rgba(16,185,129,0.15)',
  red: '#ef4444', redDim: 'rgba(239,68,68,0.15)',
  yellow: '#f59e0b', yellowDim: 'rgba(245,158,11,0.15)',
  orange: '#ff9800', orangeDim: 'rgba(255,152,0,0.15)',
  purple: '#8b5cf6', purpleDim: 'rgba(139,92,246,0.15)',
  gray: '#6b7280',
  text: '#e5e7eb', textDim: '#9ca3af', white: '#f9fafb',
};

const fmt = (n) => n?.toLocaleString() ?? '-';

const MODE_CONFIG = {
  virtual: { label: '가상투자', icon: '📊', color: COLORS.accent, bg: COLORS.accentDim },
  mock:    { label: '모의투자', icon: '🏦', color: COLORS.purple, bg: COLORS.purpleDim },
  real:    { label: '실전투자', icon: '🔴', color: COLORS.red, bg: COLORS.redDim },
};

// KST 날짜 포맷
function toKSTDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return dateStr; }
}

function toKSTTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function TradeJournal() {
  const [mode, setMode] = useState('virtual');
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [summary, setSummary] = useState({ totalPnl: 0, winCount: 0, lossCount: 0, cashBalance: 0 });

  // 거래 내역 로드
  const loadTrades = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trade_journal')
        .select('*')
        .eq('mode', mode)
        .order('trade_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      setTrades(data || []);

      // 요약 계산
      const sells = (data || []).filter(t => t.trade_type === 'sell');
      const totalPnl = sells.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
      const winCount = sells.filter(t => (t.realized_pnl || 0) > 0).length;
      const lossCount = sells.filter(t => (t.realized_pnl || 0) < 0).length;
      const lastTrade = (data || [])[0];
      setSummary({ totalPnl, winCount, lossCount, cashBalance: lastTrade?.cash_balance || 0 });
    } catch (e) {
      console.error('매매 일지 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { loadTrades(); }, [loadTrades]);

  // 거래 추가
  const handleAddTrade = async (tradeData) => {
    try {
      const { error } = await supabase
        .from('trade_journal')
        .insert({ ...tradeData, mode });
      if (error) throw error;
      setShowAddForm(false);
      await loadTrades();
    } catch (e) {
      alert('거래 추가 실패: ' + e.message);
    }
  };

  // 거래 삭제
  const handleDeleteTrade = async (id) => {
    if (!window.confirm('이 거래 기록을 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('trade_journal').delete().eq('id', id);
      if (error) throw error;
      await loadTrades();
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  };

  const modeConf = MODE_CONFIG[mode];
  const isProfit = summary.totalPnl >= 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.white, margin: 0 }}>
          📋 매매 일지
        </h1>
        <p style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>
          투자모드별 매수·매도 거래 내역을 기록하고 손익을 추적합니다
        </p>
      </div>

      {/* 모드 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {Object.entries(MODE_CONFIG).map(([key, conf]) => (
          <button key={key} onClick={() => setMode(key)} style={{
            flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
            border: mode === key ? `2px solid ${conf.color}` : `1px solid ${COLORS.cardBorder}`,
            background: mode === key ? conf.bg : COLORS.card,
            color: mode === key ? conf.color : COLORS.textDim,
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.2s',
          }}>
            {conf.icon} {conf.label}
          </button>
        ))}
      </div>

      {/* 요약 카드 */}
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12,
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <SummaryCell label="누적 실현손익"
            value={`${isProfit ? '+' : ''}${fmt(summary.totalPnl)}`}
            color={isProfit ? COLORS.red : COLORS.accent} />
          <SummaryCell label="현재 예수금"
            value={fmt(summary.cashBalance)} color={COLORS.white} />
          <SummaryCell label="승/패"
            value={<><span style={{ color: COLORS.red }}>{summary.winCount}승</span>{' '}<span style={{ color: COLORS.accent }}>{summary.lossCount}패</span></>}
            color={COLORS.white} />
          <SummaryCell label="승률"
            value={`${summary.winCount + summary.lossCount > 0 ? Math.round(summary.winCount / (summary.winCount + summary.lossCount) * 100) : 0}%`}
            color={COLORS.white} />
        </div>
      </div>

      {/* 거래 추가 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: COLORS.textDim }}>총 {trades.length}건</span>
        <button onClick={() => setShowAddForm(!showAddForm)} style={{
          padding: '8px 16px', borderRadius: 8,
          border: `1px solid ${modeConf.color}40`, background: modeConf.bg,
          color: modeConf.color, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
        }}>
          {showAddForm ? '✕ 닫기' : '+ 거래 추가'}
        </button>
      </div>

      {/* 거래 추가 폼 */}
      {showAddForm && <AddTradeForm onSubmit={handleAddTrade} onCancel={() => setShowAddForm(false)} />}

      {/* 거래 내역 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: COLORS.textDim }}>로딩 중...</div>
      ) : trades.length === 0 ? (
        <EmptyState label={modeConf.label} />
      ) : (
        <TradeTable trades={trades} onDelete={handleDeleteTrade} />
      )}
    </div>
  );
}

// ── 요약 셀 ──
function SummaryCell({ label, value, color }) {
  return (
    <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color }}>
        {value}
      </div>
    </div>
  );
}

// ── 빈 상태 ──
function EmptyState({ label }) {
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12,
      padding: 40, textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white, marginBottom: 6 }}>
        {label} 거래 내역이 없습니다
      </div>
      <div style={{ fontSize: 12, color: COLORS.textDim }}>
        거래를 추가하거나, 매수/매도 시 자동으로 기록됩니다
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 거래 추가 폼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AddTradeForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({
    trade_type: 'buy', stock_code: '', stock_name: '',
    price: '', quantity: '', realized_pnl: '', realized_pnl_pct: '',
    cash_balance: '', memo: '',
    trade_date: new Date().toISOString().slice(0, 16),
  });

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const amount = (Number(form.price) || 0) * (Number(form.quantity) || 0);

  const handleSubmit = () => {
    if (!form.stock_code || !form.stock_name || !form.price || !form.quantity) {
      alert('종목코드, 종목명, 가격, 수량은 필수입니다.');
      return;
    }
    onSubmit({
      trade_type: form.trade_type,
      stock_code: form.stock_code.trim(),
      stock_name: form.stock_name.trim(),
      price: Number(form.price),
      quantity: Number(form.quantity),
      amount,
      realized_pnl: form.trade_type === 'sell' ? (Number(form.realized_pnl) || 0) : 0,
      realized_pnl_pct: form.trade_type === 'sell' ? (Number(form.realized_pnl_pct) || 0) : 0,
      cash_balance: Number(form.cash_balance) || 0,
      memo: form.memo,
      trade_date: new Date(form.trade_date).toISOString(),
    });
  };

  const S = {
    input: {
      width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
      background: COLORS.bg, border: `1px solid ${COLORS.cardBorder}`,
      borderRadius: 6, color: COLORS.white, outline: 'none',
    },
    label: { fontSize: 11, color: COLORS.textDim, marginBottom: 4 },
  };

  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12,
      padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white, marginBottom: 14 }}>거래 추가</div>

      {/* 매수/매도 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[{ key: 'buy', label: '매수', color: COLORS.red }, { key: 'sell', label: '매도', color: COLORS.accent }].map(t => (
          <button key={t.key} onClick={() => update('trade_type', t.key)} style={{
            flex: 1, padding: 8, borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            border: form.trade_type === t.key ? `2px solid ${t.color}` : `1px solid ${COLORS.cardBorder}`,
            background: form.trade_type === t.key ? `${t.color}18` : 'transparent',
            color: form.trade_type === t.key ? t.color : COLORS.textDim, fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {/* 종목 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={S.label}>종목코드</div>
          <input value={form.stock_code} onChange={e => update('stock_code', e.target.value)} placeholder="005930" style={S.input} />
        </div>
        <div>
          <div style={S.label}>종목명</div>
          <input value={form.stock_name} onChange={e => update('stock_name', e.target.value)} placeholder="삼성전자" style={S.input} />
        </div>
      </div>

      {/* 가격/수량/총액 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={S.label}>가격 (원)</div>
          <input type="number" value={form.price} onChange={e => update('price', e.target.value)} placeholder="50000" style={S.input} />
        </div>
        <div>
          <div style={S.label}>수량 (주)</div>
          <input type="number" value={form.quantity} onChange={e => update('quantity', e.target.value)} placeholder="10" style={S.input} />
        </div>
        <div>
          <div style={S.label}>총 금액</div>
          <div style={{ ...S.input, background: 'transparent', color: COLORS.yellow, fontWeight: 600 }}>{fmt(amount)}</div>
        </div>
      </div>

      {/* 매도 시 손익 */}
      {form.trade_type === 'sell' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={S.label}>실현 손익 (원)</div>
            <input type="number" value={form.realized_pnl} onChange={e => update('realized_pnl', e.target.value)} placeholder="25000" style={S.input} />
          </div>
          <div>
            <div style={S.label}>수익률 (%)</div>
            <input type="number" step="0.1" value={form.realized_pnl_pct} onChange={e => update('realized_pnl_pct', e.target.value)} placeholder="5.2" style={S.input} />
          </div>
        </div>
      )}

      {/* 예수금/일시 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={S.label}>거래 후 예수금 (원)</div>
          <input type="number" value={form.cash_balance} onChange={e => update('cash_balance', e.target.value)} placeholder="500000" style={S.input} />
        </div>
        <div>
          <div style={S.label}>거래 일시</div>
          <input type="datetime-local" value={form.trade_date} onChange={e => update('trade_date', e.target.value)} style={S.input} />
        </div>
      </div>

      {/* 메모 */}
      <div style={{ marginBottom: 14 }}>
        <div style={S.label}>메모 (선택)</div>
        <input value={form.memo} onChange={e => update('memo', e.target.value)} placeholder="패턴분석 기반 매수" style={S.input} />
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{
          padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          background: 'transparent', border: `1px solid ${COLORS.cardBorder}`, color: COLORS.textDim, fontFamily: 'inherit',
        }}>취소</button>
        <button onClick={handleSubmit} style={{
          padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          background: form.trade_type === 'buy' ? COLORS.red : COLORS.accent,
          border: 'none', color: 'white', fontFamily: 'inherit',
        }}>
          {form.trade_type === 'buy' ? '매수 기록' : '매도 기록'}
        </button>
      </div>
    </div>
  );
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 거래 내역 테이블 (날짜별 그룹)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TradeTable({ trades, onDelete }) {
  const grouped = {};
  trades.forEach(t => {
    const dateKey = toKSTDate(t.trade_date);
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(t);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Object.entries(grouped).map(([dateKey, dayTrades]) => {
        const dayPnl = dayTrades.filter(t => t.trade_type === 'sell').reduce((sum, t) => sum + (t.realized_pnl || 0), 0);

        return (
          <div key={dateKey} style={{
            background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, overflow: 'hidden',
          }}>
            {/* 날짜 헤더 */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderBottom: `1px solid ${COLORS.cardBorder}`, background: COLORS.bg,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.white }}>{dateKey}</span>
              {dayPnl !== 0 && (
                <span style={{
                  fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                  color: dayPnl > 0 ? COLORS.red : COLORS.accent,
                }}>
                  일일 손익: {dayPnl > 0 ? '+' : ''}{fmt(dayPnl)}
                </span>
              )}
            </div>

            {/* 거래 행 */}
            {dayTrades.map(t => {
              const isBuy = t.trade_type === 'buy';
              const pnlColor = (t.realized_pnl || 0) >= 0 ? COLORS.red : COLORS.accent;

              return (
                <div key={t.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '56px 1fr 90px 70px 90px 90px 28px',
                  alignItems: 'center', gap: 6,
                  padding: '10px 14px', borderBottom: `1px solid ${COLORS.cardBorder}20`, fontSize: 12,
                }}>
                  {/* 매수/매도 뱃지 + 시간 */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, display: 'inline-block',
                      background: isBuy ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                      color: isBuy ? COLORS.red : COLORS.accent,
                    }}>
                      {isBuy ? '매수' : '매도'}
                    </span>
                    <div style={{ fontSize: 9, color: COLORS.gray, marginTop: 2 }}>{toKSTTime(t.trade_date)}</div>
                  </div>

                  {/* 종목 */}
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600, color: COLORS.white }}>{t.stock_name}</span>
                    <span style={{ fontSize: 10, color: COLORS.textDim, marginLeft: 6 }}>{t.stock_code}</span>
                    {t.order_no && (
                      <span style={{ fontSize: 9, color: COLORS.accent, marginLeft: 4, padding: '1px 4px', borderRadius: 3, background: COLORS.accentDim }}>
                        자동
                      </span>
                    )}
                    {t.order_no && <span style={{ fontSize: 9, color: COLORS.gray, marginLeft: 3 }}>#{t.order_no}</span>}
                    {t.memo && <span style={{ fontSize: 10, color: COLORS.gray, marginLeft: 4 }}>· {t.memo}</span>}
                  </div>

                  {/* 가격 */}
                  <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: COLORS.text }}>{fmt(t.price)}</div>

                  {/* 수량 */}
                  <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: COLORS.textDim }}>{fmt(t.quantity)}주</div>

                  {/* 총액 */}
                  <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: COLORS.text }}>{fmt(t.amount)}</div>

                  {/* 실현손익 */}
                  <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                    {!isBuy && t.realized_pnl !== 0 ? (
                      <div>
                        <div style={{ fontWeight: 700, color: pnlColor }}>
                          {t.realized_pnl > 0 ? '+' : ''}{fmt(t.realized_pnl)}
                        </div>
                        {t.realized_pnl_pct !== 0 && (
                          <div style={{ fontSize: 10, color: pnlColor }}>
                            {t.realized_pnl_pct > 0 ? '+' : ''}{t.realized_pnl_pct}%
                          </div>
                        )}
                      </div>
                    ) : <span style={{ color: COLORS.gray }}>-</span>}
                  </div>

                  {/* 삭제 */}
                  <button onClick={() => onDelete(t.id)} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: COLORS.gray, fontSize: 12, padding: 2,
                  }} title="삭제">✕</button>
                </div>
              );
            })}

            {/* 해당 날짜 마지막 예수금 */}
            {(() => {
              const last = dayTrades[dayTrades.length - 1];
              return last?.cash_balance > 0 ? (
                <div style={{
                  padding: '6px 14px', background: COLORS.bg,
                  fontSize: 11, color: COLORS.textDim, textAlign: 'right',
                }}>
                  예수금 잔고: <span style={{ color: COLORS.yellow, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmt(last.cash_balance)}
                  </span>
                </div>
              ) : null;
            })()}
          </div>
        );
      })}
    </div>
  );
}
