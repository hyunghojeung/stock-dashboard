"""
통합 매매 전략 판단 엔진 / Unified Trading Strategy Decision Engine
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
파일경로: src/strategy_engine.py

모든 매매 환경(가상투자 백테스트/실시간, KIS 모의/실전)에서
동일한 전략 판단 로직을 공유하는 순수 함수 엔진.

핵심 함수: evaluate_position()
  - 부수효과 없음 (DB 접근 X, API 호출 X)
  - 입력: 포지션 상태 + 현재가 + 전략 파라미터
  - 출력: Signal (HOLD / SELL_PROFIT / SELL_TRAILING / SELL_LOSS / SELL_TIMEOUT)
"""

from dataclasses import dataclass
from typing import Literal

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 타입 정의
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SignalType = Literal[
    "HOLD",            # 보유 유지
    "SELL_PROFIT",     # 고정 익절
    "SELL_TRAILING",   # 추적손절 (수익 확보 후 하락)
    "SELL_LOSS",       # 고정 손절
    "SELL_TIMEOUT",    # 최대 보유일 만기 청산
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 데이터 클래스
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@dataclass
class StrategyParams:
    """전략 파라미터 — 모든 전략 유형을 통합"""
    strategy_type: str          # "smart", "aggressive", "standard", etc.
    stop_loss_pct: float        # 손절선 (%)
    take_profit_pct: float      # 익절선 (%, 스마트형은 0)
    max_hold_days: int          # 최대 보유일
    # 스마트형 전용
    trailing_stop_pct: float = 0.0      # 추적손절 (고점 대비 하락 %)
    profit_activation_pct: float = 0.0  # 수익 활성화 기준 (매수가 대비 %)
    grace_days: int = 0                 # 매수 후 유예기간 (일)


@dataclass
class PositionState:
    """포지션의 현재 상태 — DB에서 로드/저장"""
    buy_price: float
    hold_days: int
    peak_price: float            # 보유 중 최고가 (종가 기준)
    trailing_activated: bool     # 수익 활성화 달성 여부


@dataclass
class Signal:
    """전략 판단 결과"""
    action: SignalType
    sell_price: float = 0.0           # 매도 예정가
    reason: str = ""                  # 사유 설명
    new_peak: float = 0.0             # 업데이트된 peak_price
    trailing_activated: bool = False  # 업데이트된 활성화 상태


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 전략 프리셋 기본값
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SMART_DEFAULTS = {
    "stop_loss_pct": 10.0,
    "trailing_stop_pct": 5.0,
    "grace_days": 7,
    "max_hold_days": 30,
    "profit_activation_pct": 10.0,
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 핵심 판단 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

    Args:
        state: 포지션 현재 상태 (매수가, 보유일, 최고가, 활성화 여부)
        current_price: 현재가 (종가)
        high_price: 장중 고가
        low_price: 장중 저가
        params: 전략 파라미터

    Returns:
        Signal: 매도/보유 판단 결과 + 업데이트된 상태
    """
    buy_price = state.buy_price
    hold_days = state.hold_days

    # ── peak_price 업데이트 (종가 기준 — 장중 고가 사용 시 조기 발동 방지) ──
    new_peak = max(state.peak_price, current_price)

    # ── 수익률 계산 ──
    close_pct = ((current_price - buy_price) / buy_price) * 100
    high_pct = ((high_price - buy_price) / buy_price) * 100
    low_pct = ((low_price - buy_price) / buy_price) * 100
    peak_pct = ((new_peak - buy_price) / buy_price) * 100

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 스마트형 전략
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if params.strategy_type == "smart":
        # 수익 활성화 체크 (한번 달성하면 영구 유지)
        new_trailing_activated = (
            state.trailing_activated or peak_pct >= params.profit_activation_pct
        )

        # 1) 유예기간 내 → HOLD (손절/추적 모두 유예)
        if hold_days <= params.grace_days:
            return Signal(
                action="HOLD",
                new_peak=new_peak,
                trailing_activated=new_trailing_activated,
            )

        # 2) 추적손절 (수익 활성화 이후에만)
        if new_trailing_activated and params.trailing_stop_pct > 0:
            drop_from_peak = ((current_price - new_peak) / new_peak) * 100
            if drop_from_peak <= -params.trailing_stop_pct:
                return Signal(
                    action="SELL_TRAILING",
                    sell_price=current_price,
                    reason=(
                        f"추적손절: 고점{int(new_peak):,}→현재{int(current_price):,} "
                        f"({drop_from_peak:.1f}%, 한도 -{params.trailing_stop_pct}%)"
                    ),
                    new_peak=new_peak,
                    trailing_activated=new_trailing_activated,
                )

        # 3) 종가 기준 고정 손절 (유예기간 이후)
        if close_pct <= -params.stop_loss_pct:
            return Signal(
                action="SELL_LOSS",
                sell_price=current_price,
                reason=f"손절: {close_pct:.1f}% (한도 -{params.stop_loss_pct}%)",
                new_peak=new_peak,
                trailing_activated=new_trailing_activated,
            )

        # 4) 최대 보유일 만기
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

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 일반 전략 (공격형/기본형/보수형/장기형/커스텀)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    else:
        # 1) 익절 (장중 고가 기준)
        if params.take_profit_pct > 0 and high_pct >= params.take_profit_pct:
            sell_price = buy_price * (1 + params.take_profit_pct / 100)
            return Signal(
                action="SELL_PROFIT",
                sell_price=round(sell_price),
                reason=f"익절: +{params.take_profit_pct}% 달성",
                new_peak=new_peak,
            )

        # 2) 손절 (장중 저가 기준)
        if low_pct <= -params.stop_loss_pct:
            sell_price = buy_price * (1 - params.stop_loss_pct / 100)
            return Signal(
                action="SELL_LOSS",
                sell_price=round(sell_price),
                reason=f"손절: -{params.stop_loss_pct}% 도달",
                new_peak=new_peak,
            )

        # 3) 최대 보유일 만기
        if hold_days >= params.max_hold_days:
            return Signal(
                action="SELL_TIMEOUT",
                sell_price=current_price,
                reason=f"만기: {hold_days}일 (한도 {params.max_hold_days}일)",
                new_peak=new_peak,
            )

        return Signal(action="HOLD", new_peak=new_peak)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 유틸리티: Signal → DB 상태 매핑
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNAL_TO_STATUS = {
    "SELL_PROFIT": "sold_profit",
    "SELL_TRAILING": "sold_trailing",
    "SELL_LOSS": "sold_loss",
    "SELL_TIMEOUT": "sold_timeout",
}


def signal_to_db_status(signal_action: SignalType) -> str:
    """Signal action을 DB status 문자열로 변환"""
    return SIGNAL_TO_STATUS.get(signal_action, "holding")
