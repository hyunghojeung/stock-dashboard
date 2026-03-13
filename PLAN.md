# 통합 매매 전략 엔진 설계안 (Unified Trading Strategy Engine)

## 문제 정의

현재 시스템에는 3개의 독립적인 매매 환경이 존재한다:

| 환경 | 현재 상태 | 문제점 |
|------|-----------|--------|
| **가상투자 (백테스트)** | 스마트형 전략 완벽 구현 | 시뮬레이션 전용, 실시간 미적용 |
| **가상투자 (실시간)** | 단순 고정 익절/손절만 체크 | peak_price 추적, 수익 활성화, 추적손절, 유예기간 **미적용** |
| **KIS 모의/실전투자** | 매매 전략 엔진 자체가 없음 | 수동 매매만 가능, 자동 청산 로직 없음 |

**핵심 문제**: `simulate_smart_strategy()`의 정교한 로직이 백테스트에만 존재하고, 실시간 매매(`update_realtime()`)와 KIS 투자에는 전혀 반영되지 않음.

---

## 설계 원칙

1. **전략 엔진 단일화**: 백테스트/가상투자/KIS 모의/KIS 실전 모두 **동일한 전략 판단 함수**를 공유
2. **실행 계층 분리**: 전략 판단(Signal) → 실행(Execution)을 분리하여, 실행만 환경별로 다르게
3. **DB 상태 기반**: peak_price, 유예기간 등 전략 상태를 DB에 저장하여 서버 재시작에도 유지
4. **점진적 적용**: 가상투자 먼저 수정 → KIS 모의 → KIS 실전 순으로 확장

---

## 아키텍처 설계

```
┌─────────────────────────────────────────────────────┐
│              Strategy Decision Engine                │
│         (전략 판단 — 모든 환경 공통)                    │
│                                                     │
│  evaluate_position(position, current_price, high,   │
│                    low, strategy_params)             │
│         → Signal: HOLD / SELL_PROFIT / SELL_LOSS    │
│           / SELL_TRAILING / SELL_TIMEOUT             │
│                                                     │
│  내부 로직:                                           │
│   1. grace_days 유예기간 체크                          │
│   2. profit_activation 수익 활성화 판단                 │
│   3. trailing_stop 추적손절 (peak 대비 하락)            │
│   4. stop_loss 고정 손절                              │
│   5. max_hold_days 만기 체크                          │
│   6. take_profit 고정 익절 (비-스마트형)                 │
└──────────────────┬──────────────────────────────────┘
                   │ Signal
        ┌──────────┼──────────┐
        ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ 가상투자  │ │ KIS 모의  │ │ KIS 실전  │
│ Executor │ │ Executor │ │ Executor │
│          │ │          │ │          │
│ DB 업데이트│ │ KIS API  │ │ KIS API  │
│ (Supabase)│ │ 모의 주문 │ │ 실전 주문 │
└──────────┘ └──────────┘ └──────────┘
```

---

## 상세 설계

### 1단계: 통합 전략 판단 함수 (`strategy_engine.py` 신규)

```python
# src/strategy_engine.py — 모든 환경에서 공유하는 전략 판단 엔진

from dataclasses import dataclass
from typing import Optional, Literal

SignalType = Literal[
    "HOLD",           # 보유 유지
    "SELL_PROFIT",    # 고정 익절
    "SELL_TRAILING",  # 추적손절 (수익 확보)
    "SELL_LOSS",      # 손절
    "SELL_TIMEOUT",   # 만기 청산
]

@dataclass
class StrategyParams:
    """전략 파라미터 — 모든 전략 유형을 통합"""
    strategy_type: str          # "smart", "aggressive", "standard", etc.
    stop_loss_pct: float        # 손절선 (%)
    take_profit_pct: float      # 익절선 (%, 스마트형은 0)
    max_hold_days: int          # 최대 보유일
    # 스마트형 전용
    trailing_stop_pct: float = 0.0     # 추적손절 (%)
    profit_activation_pct: float = 0.0 # 수익 활성화 기준 (%)
    grace_days: int = 0                # 유예기간 (일)
    use_close_stop: bool = False       # 종가 기준 손절 여부


@dataclass
class PositionState:
    """포지션의 현재 상태 — DB에서 로드/저장"""
    buy_price: float
    hold_days: int
    peak_price: float           # 보유 중 최고가 (종가 기준)
    trailing_activated: bool    # 수익 활성화 달성 여부


@dataclass
class Signal:
    """전략 판단 결과"""
    action: SignalType
    sell_price: float = 0.0     # 매도 예정가
    reason: str = ""            # 사유 설명
    new_peak: float = 0.0       # 업데이트된 peak_price
    trailing_activated: bool = False  # 업데이트된 활성화 상태


def evaluate_position(
    state: PositionState,
    current_price: float,
    high_price: float,
    low_price: float,
    params: StrategyParams,
) -> Signal:
    """
    포지션 평가 — 매도 신호 판단 (핵심 통합 함수)

    모든 환경(가상투자/KIS모의/KIS실전)에서 이 함수 하나로 판단.
    부수효과 없음 (DB 접근 X, API 호출 X) — 순수 함수.
    """
    buy_price = state.buy_price
    hold_days = state.hold_days
    peak_price = state.peak_price
    trailing_activated = state.trailing_activated

    # ── peak_price 업데이트 (종가 기준) ──
    new_peak = max(peak_price, current_price)

    # ── 수익률 계산 ──
    close_pct = ((current_price - buy_price) / buy_price) * 100
    high_pct = ((high_price - buy_price) / buy_price) * 100
    low_pct = ((low_price - buy_price) / buy_price) * 100
    peak_pct = ((new_peak - buy_price) / buy_price) * 100

    # ── 스마트형 전략 ──
    if params.strategy_type == "smart":
        # 수익 활성화 체크 (한번 달성하면 영구 유지)
        new_trailing_activated = trailing_activated or (peak_pct >= params.profit_activation_pct)

        # 1) 유예기간 내 → HOLD (손절/추적 모두 유예)
        if hold_days <= params.grace_days:
            return Signal(
                action="HOLD",
                new_peak=new_peak,
                trailing_activated=new_trailing_activated,
            )

        # 2) 추적손절 (수익 활성화 이후)
        if new_trailing_activated and params.trailing_stop_pct > 0:
            drop_from_peak = ((current_price - new_peak) / new_peak) * 100
            if drop_from_peak <= -params.trailing_stop_pct:
                return Signal(
                    action="SELL_TRAILING",
                    sell_price=current_price,
                    reason=f"추적손절: 고점{int(new_peak)}→현재{int(current_price)} ({drop_from_peak:.1f}%)",
                    new_peak=new_peak,
                    trailing_activated=new_trailing_activated,
                )

        # 3) 고정 손절 (종가 기준)
        if close_pct <= -params.stop_loss_pct:
            return Signal(
                action="SELL_LOSS",
                sell_price=current_price,
                reason=f"손절: {close_pct:.1f}% (한도 -{params.stop_loss_pct}%)",
                new_peak=new_peak,
                trailing_activated=new_trailing_activated,
            )

        # 4) 만기
        if hold_days >= params.max_hold_days:
            return Signal(
                action="SELL_TIMEOUT",
                sell_price=current_price,
                reason=f"만기: {hold_days}일 (한도 {params.max_hold_days}일)",
                new_peak=new_peak,
                trailing_activated=new_trailing_activated,
            )

        return Signal(
            action="HOLD",
            new_peak=new_peak,
            trailing_activated=new_trailing_activated,
        )

    # ── 일반 전략 (공격형/기본형/보수형/장기형/커스텀) ──
    else:
        # 1) 익절 (장중 고가 기준)
        if params.take_profit_pct > 0 and high_pct >= params.take_profit_pct:
            sell_price = buy_price * (1 + params.take_profit_pct / 100)
            return Signal(
                action="SELL_PROFIT",
                sell_price=sell_price,
                reason=f"익절: +{params.take_profit_pct}% 달성",
                new_peak=new_peak,
            )

        # 2) 손절 (장중 저가 기준)
        if low_pct <= -params.stop_loss_pct:
            sell_price = buy_price * (1 - params.stop_loss_pct / 100)
            return Signal(
                action="SELL_LOSS",
                sell_price=sell_price,
                reason=f"손절: -{params.stop_loss_pct}% 도달",
                new_peak=new_peak,
            )

        # 3) 만기
        if hold_days >= params.max_hold_days:
            return Signal(
                action="SELL_TIMEOUT",
                sell_price=current_price,
                reason=f"만기: {hold_days}일",
                new_peak=new_peak,
            )

        return Signal(action="HOLD", new_peak=new_peak)
```

---

### 2단계: DB 스키마 변경 (virtual_positions 테이블)

현재 `peak_price` 컬럼은 이미 존재 (프론트엔드에서 표시 중). 추가 필요 컬럼:

```sql
-- virtual_positions 테이블에 스마트형 전략 상태 컬럼 추가
ALTER TABLE virtual_positions ADD COLUMN IF NOT EXISTS
    trailing_activated BOOLEAN DEFAULT FALSE;
    -- 수익 활성화 달성 여부 (한번 TRUE되면 유지)

ALTER TABLE virtual_positions ADD COLUMN IF NOT EXISTS
    grace_days INTEGER DEFAULT 0;
    -- 유예기간 설정값 (포지션 생성 시 전략에서 복사)

ALTER TABLE virtual_positions ADD COLUMN IF NOT EXISTS
    trailing_stop_pct FLOAT DEFAULT 0;

ALTER TABLE virtual_positions ADD COLUMN IF NOT EXISTS
    profit_activation_pct FLOAT DEFAULT 0;

-- KIS 연동용 테이블 (신규)
CREATE TABLE IF NOT EXISTS kis_managed_positions (
    id SERIAL PRIMARY KEY,
    account_type TEXT NOT NULL,          -- 'virtual' or 'real'
    stock_code TEXT NOT NULL,
    stock_name TEXT DEFAULT '',
    buy_price FLOAT NOT NULL,
    buy_date TEXT NOT NULL,
    current_price FLOAT DEFAULT 0,
    peak_price FLOAT DEFAULT 0,
    hold_days INTEGER DEFAULT 0,
    strategy TEXT DEFAULT 'smart',       -- 전략 유형
    stop_loss_pct FLOAT DEFAULT 12.0,
    take_profit_pct FLOAT DEFAULT 0,
    max_hold_days INTEGER DEFAULT 30,
    trailing_stop_pct FLOAT DEFAULT 5.0,
    profit_activation_pct FLOAT DEFAULT 15.0,
    grace_days INTEGER DEFAULT 7,
    trailing_activated BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'holding',       -- holding / sold_profit / sold_loss / sold_trailing / sold_timeout
    sell_price FLOAT,
    sell_date TEXT,
    profit_pct FLOAT,
    profit_won INTEGER,
    qty INTEGER DEFAULT 0,              -- KIS 실제 보유 수량
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3단계: 가상투자 실시간 업데이트 함수 재작성

**파일**: `src/virtual_invest.py` — `update_realtime()` 수정

```python
async def update_realtime_v2(session_id: str, supabase=None) -> Dict:
    """
    실시간 모의투자 가격 갱신 — 통합 전략 엔진 사용
    """
    if not supabase:
        return {"error": "DB 연결 없음"}

    from strategy_engine import evaluate_position, StrategyParams, PositionState, Signal

    try:
        # 세션 정보 (전략 파라미터 포함)
        sess = supabase.table("virtual_realtime_session").select("*").eq(
            "session_id", session_id).single().execute()
        sess_data = sess.data

        # 활성 포지션 조회
        result = supabase.table("virtual_positions").select("*").eq(
            "session_id", session_id).eq("status", "holding").execute()
        positions = result.data or []

        # 전략 파라미터 구성
        strategy = sess_data.get("strategy", "smart")
        params = StrategyParams(
            strategy_type=strategy,
            stop_loss_pct=float(sess_data.get("stop_loss_pct", 12.0)),
            take_profit_pct=float(sess_data.get("take_profit_pct", 0)),
            max_hold_days=int(sess_data.get("max_hold_days", 30)),
            trailing_stop_pct=float(sess_data.get("trailing_stop_pct", 5.0)),
            profit_activation_pct=float(sess_data.get("profit_activation_pct", 15.0)),
            grace_days=int(sess_data.get("grace_days", 7)),
            use_close_stop=(strategy == "smart"),
        )

        updated = 0
        signals = []

        for pos in positions:
            code = pos["stock_code"]
            candles = fetch_daily_candles(code, days=5)
            if not candles:
                continue

            latest = candles[-1]
            current_price = latest["close"]
            high_price = latest["high"]
            low_price = latest["low"]

            # 보유일 계산
            buy_date = datetime.strptime(pos["buy_date"], "%Y-%m-%d")
            hold_days = (datetime.now() - buy_date).days

            # 포지션 상태 구성
            state = PositionState(
                buy_price=float(pos["buy_price"]),
                hold_days=hold_days,
                peak_price=float(pos.get("peak_price", pos["buy_price"])),
                trailing_activated=bool(pos.get("trailing_activated", False)),
            )

            # ★ 통합 전략 엔진으로 판단
            signal = evaluate_position(state, current_price, high_price, low_price, params)

            # DB 업데이트 (공통)
            update_data = {
                "current_price": current_price,
                "hold_days": hold_days,
                "profit_pct": round(((current_price - state.buy_price) / state.buy_price) * 100, 2),
                "peak_price": signal.new_peak,
                "trailing_activated": signal.trailing_activated,
            }

            # 매도 신호 처리
            if signal.action != "HOLD":
                status_map = {
                    "SELL_PROFIT": "sold_profit",
                    "SELL_TRAILING": "sold_trailing",
                    "SELL_LOSS": "sold_loss",
                    "SELL_TIMEOUT": "sold_timeout",
                }
                update_data["status"] = status_map[signal.action]
                update_data["sell_price"] = signal.sell_price
                update_data["sell_date"] = datetime.now().strftime("%Y-%m-%d")
                update_data["sell_reason"] = signal.reason

                # 수익금 계산
                invest = float(pos.get("invest_amount", 200000))
                quantity = invest / state.buy_price
                sell_amount = quantity * signal.sell_price
                costs = sell_amount * (COMMISSION_RATE + SELL_TAX_RATE) + invest * COMMISSION_RATE
                profit_won = round(sell_amount - invest - costs)
                update_data["profit_won"] = profit_won

                signals.append({
                    "stock": pos["stock_name"],
                    "action": signal.action,
                    "reason": signal.reason,
                    "profit_won": profit_won,
                })

            supabase.table("virtual_positions").update(update_data).eq("id", pos["id"]).execute()
            updated += 1

        return {
            "session_id": session_id,
            "updated": updated,
            "positions": len(positions),
            "signals": signals,  # 매도 실행된 내역
        }

    except Exception as e:
        logger.error(f"[실시간모의] 업데이트 오류: {e}")
        return {"error": str(e)}
```

---

### 4단계: KIS 자동매매 통합 (`kis_strategy_executor.py` 신규)

```python
# src/kis_strategy_executor.py — KIS 모의/실전투자 자동 청산 엔진

from strategy_engine import evaluate_position, StrategyParams, PositionState
from kis_api import get_kis_client

async def check_and_execute_kis_positions(supabase, account_type="virtual"):
    """
    KIS 보유종목을 전략 엔진으로 평가하고, 매도 신호 시 KIS API로 실제 주문 실행

    account_type: "virtual" (모의) 또는 "real" (실전)
    """
    client = get_kis_client()
    if not client.is_configured:
        return {"error": "KIS API 미설정"}

    # 1. KIS 잔고 조회 (실제 보유종목)
    balance = await client.get_balance()
    holdings = balance.get("output1", [])

    # 2. DB에서 전략 설정이 있는 포지션 조회
    managed = supabase.table("kis_managed_positions").select("*").eq(
        "account_type", account_type
    ).eq("status", "holding").execute()
    managed_map = {p["stock_code"]: p for p in (managed.data or [])}

    results = []

    for h in holdings:
        code = h.get("pdno", "")
        qty = int(h.get("hldg_qty", "0"))
        if qty <= 0 or code not in managed_map:
            continue

        pos = managed_map[code]

        # KIS 현재가 조회 (장중 고가/저가 포함)
        quote = await client.get_current_price(code)
        q = quote.get("output", {})
        current_price = int(q.get("stck_prpr", "0"))
        high_price = int(q.get("stck_hgpr", "0"))
        low_price = int(q.get("stck_lwpr", "0"))

        # 전략 파라미터
        params = StrategyParams(
            strategy_type=pos.get("strategy", "smart"),
            stop_loss_pct=float(pos.get("stop_loss_pct", 12.0)),
            take_profit_pct=float(pos.get("take_profit_pct", 0)),
            max_hold_days=int(pos.get("max_hold_days", 30)),
            trailing_stop_pct=float(pos.get("trailing_stop_pct", 5.0)),
            profit_activation_pct=float(pos.get("profit_activation_pct", 15.0)),
            grace_days=int(pos.get("grace_days", 7)),
            use_close_stop=(pos.get("strategy") == "smart"),
        )

        # 포지션 상태
        from datetime import datetime
        buy_date = datetime.strptime(pos["buy_date"], "%Y-%m-%d")
        hold_days = (datetime.now() - buy_date).days

        state = PositionState(
            buy_price=float(pos["buy_price"]),
            hold_days=hold_days,
            peak_price=float(pos.get("peak_price", pos["buy_price"])),
            trailing_activated=bool(pos.get("trailing_activated", False)),
        )

        # ★ 통합 전략 판단
        signal = evaluate_position(state, current_price, high_price, low_price, params)

        # peak_price, trailing_activated 상태 항상 업데이트
        supabase.table("kis_managed_positions").update({
            "current_price": current_price,
            "peak_price": signal.new_peak,
            "hold_days": hold_days,
            "trailing_activated": signal.trailing_activated,
            "profit_pct": round(((current_price - state.buy_price) / state.buy_price) * 100, 2),
            "updated_at": datetime.now().isoformat(),
        }).eq("id", pos["id"]).execute()

        # 매도 신호 → KIS API 시장가 매도 주문
        if signal.action != "HOLD":
            try:
                order_result = await client.order_sell(code, qty, price=0, order_type="01")
                success = order_result.get("rt_cd") == "0"

                if success:
                    supabase.table("kis_managed_positions").update({
                        "status": f"sold_{signal.action.split('_')[1].lower()}",
                        "sell_price": current_price,
                        "sell_date": datetime.now().strftime("%Y-%m-%d"),
                    }).eq("id", pos["id"]).execute()

                results.append({
                    "stock_code": code,
                    "stock_name": pos.get("stock_name", ""),
                    "signal": signal.action,
                    "reason": signal.reason,
                    "order_success": success,
                    "order_no": order_result.get("output", {}).get("ODNO", ""),
                })

            except Exception as e:
                results.append({
                    "stock_code": code,
                    "signal": signal.action,
                    "error": str(e),
                })

    return {"account_type": account_type, "checked": len(holdings), "results": results}
```

---

### 5단계: 서버 스케줄러 등록 (자동 실행)

**파일**: `src/main.py` — lifespan에 추가

```python
# main.py lifespan 내 추가

# ★ 가상투자 + KIS 자동 청산 스케줄러 (장중 10분 간격)
try:
    from kis_strategy_executor import check_and_execute_kis_positions
    from virtual_invest import update_realtime_v2
    from app.core.config import get_supabase

    async def scheduled_strategy_check():
        """장중 자동 전략 체크 — 10분 간격"""
        from app.utils.kr_holiday import is_market_open_now
        from datetime import datetime
        now = datetime.now(KST)
        if not is_market_open_now(now):
            return

        supabase = get_supabase()

        # 1. 가상투자 활성 세션 전체 업데이트
        sessions = supabase.table("virtual_realtime_session").select("session_id").eq(
            "status", "active").execute()
        for s in (sessions.data or []):
            await update_realtime_v2(s["session_id"], supabase)

        # 2. KIS 관리 포지션 체크 (모의)
        await check_and_execute_kis_positions(supabase, "virtual")

        # 3. KIS 관리 포지션 체크 (실전) — 별도 활성화 필요
        # await check_and_execute_kis_positions(supabase, "real")

    strategy_scheduler = BackgroundScheduler(timezone=pytz.timezone("Asia/Seoul"))
    strategy_scheduler.add_job(
        lambda: asyncio.run(scheduled_strategy_check()),
        CronTrigger(
            day_of_week='mon-fri',
            hour='9-15',
            minute='*/10',
            timezone=pytz.timezone("Asia/Seoul"),
        ),
        id="strategy_auto_check",
        name="전략 자동 체크 (10분 간격)",
        replace_existing=True,
    )
    strategy_scheduler.start()
    print("[스케줄러] 전략 자동 체크 등록 (장중 10분 간격)")
except Exception as e:
    print(f"[스케줄러] 전략 자동 체크 등록 실패: {e}")
```

---

### 6단계: 프론트엔드 변경 사항

#### 6-1. VirtualPortfolioTracker.jsx — 추적손절 상태 표시 강화

현재 `peak_price`는 이미 표시 중. 추가로:
- `trailing_activated` 상태 배지 표시 (수익 활성화 달성 여부)
- 매도 사유(`sell_reason`) 표시
- 추적손절 진행률 게이지 바 (peak 대비 현재 하락 %)

#### 6-2. KIS 모의/실전투자 페이지 — 전략 관리 UI 추가

- 보유종목에 전략 연결하는 버튼 ("전략 적용")
- 전략 선택 (스마트형/공격형/기본형 등)
- 자동매매 ON/OFF 토글
- 전략 상태 모니터링 (유예기간 잔여일, 수익 활성화 진행률, 추적손절 게이지)

---

## 구현 순서 (4단계 점진 적용)

### Phase 1: 통합 전략 엔진 생성 (가장 먼저)
- [ ] `src/strategy_engine.py` 신규 생성
- [ ] `evaluate_position()` 순수 함수 구현
- [ ] 기존 `simulate_smart_strategy()` 로직과 동일성 검증 테스트

### Phase 2: 가상투자 실시간 적용
- [ ] DB에 `trailing_activated` 컬럼 추가
- [ ] `update_realtime()` → `update_realtime_v2()`로 교체 (strategy_engine 사용)
- [ ] 프론트엔드에 추적손절 상태 표시 강화
- [ ] 서버 스케줄러에 자동 체크 등록 (10분 간격)

### Phase 3: KIS 모의투자 적용
- [ ] `kis_managed_positions` 테이블 생성
- [ ] `kis_strategy_executor.py` 신규 생성
- [ ] KIS 보유종목 → 전략 연결 API 생성
- [ ] KIS 모의투자 UI에 전략 관리 패널 추가
- [ ] 모의투자 자동 매도 테스트

### Phase 4: KIS 실전투자 적용
- [ ] 실전 계정 전환 시 안전장치 (확인 다이얼로그, 매도 한도)
- [ ] 실전 주문 실행 전 2차 확인 로직
- [ ] 실전 매매 로그 기록 및 알림 (카카오톡 연동)
- [ ] 실전 활성화 (scheduler에서 주석 해제)

---

## 핵심 설계 포인트

### 왜 순수 함수(evaluate_position)인가?

1. **테스트 용이**: DB/API 의존 없이 단위 테스트 가능
2. **재사용성**: 백테스트, 가상투자, KIS 모의, KIS 실전 모두 동일 함수 호출
3. **버그 방지**: 백테스트와 실시간의 판단 로직 불일치 원천 차단
4. **디버깅**: Signal 객체로 매도 사유를 명확히 추적

### KIS 실전투자 안전장치

1. **이중 확인**: 매도 신호 발생 시 즉시 실행하지 않고 `pending_signals` 테이블에 저장 → 사용자 승인 후 실행 (옵션)
2. **일일 매도 한도**: 하루 최대 N건 자동 매도 제한
3. **긴급 정지**: 프론트엔드에서 "자동매매 중지" 버튼으로 즉시 비활성화
4. **알림**: 매도 실행 시 카카오톡/앱 푸시 알림

### peak_price 업데이트 타이밍

| 환경 | 업데이트 시점 | 데이터 소스 |
|------|-------------|------------|
| 가상투자 | 20분 자동갱신 + 수동 갱신 | 네이버 금융 일봉/현재가 |
| KIS 모의/실전 | 10분 스케줄러 | KIS API 현재가 (장중 고가 포함) |
| 백테스트 | 일봉 순회 시 | 과거 일봉 데이터 |
