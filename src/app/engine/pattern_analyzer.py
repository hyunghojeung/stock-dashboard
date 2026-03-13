"""패턴 분석 엔진 — 급상승 감지"""
from dataclasses import dataclass
from typing import List


@dataclass
class CandleDay:
    """일봉 데이터"""
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class SurgeInfo:
    """급상승 구간 정보"""
    start_idx: int
    end_idx: int
    start_date: str
    end_date: str
    start_price: float
    peak_price: float
    rise_pct: float
    rise_days: int


def detect_surges(
    candles: List[CandleDay],
    code: str,
    name: str,
    rise_pct: float = 30.0,
    rise_window: int = 5,
) -> List[SurgeInfo]:
    """
    일봉 데이터에서 급상승 구간을 감지합니다.
    rise_window 기간 내에 rise_pct% 이상 상승한 구간을 찾습니다.
    """
    if len(candles) < rise_window + 1:
        return []

    surges = []
    i = 0
    while i < len(candles) - rise_window:
        base_price = candles[i].close
        if base_price <= 0:
            i += 1
            continue

        # rise_window 내 최고가 찾기
        best_j = i
        best_price = base_price
        for j in range(i + 1, min(i + rise_window + 1, len(candles))):
            if candles[j].high > best_price:
                best_price = candles[j].high
                best_j = j

        pct = ((best_price - base_price) / base_price) * 100
        if pct >= rise_pct:
            surges.append(SurgeInfo(
                start_idx=i,
                end_idx=best_j,
                start_date=candles[i].date,
                end_date=candles[best_j].date,
                start_price=base_price,
                peak_price=best_price,
                rise_pct=round(pct, 2),
                rise_days=best_j - i,
            ))
            i = best_j + 1  # 겹치지 않도록 건너뛰기
        else:
            i += 1

    return surges
