"""진입 전략 평가 엔진"""
from typing import List, Dict, Optional


def evaluate_entry(
    candles: List[Dict],
    clusters: List = None,
    strategy_config: Dict = None,
) -> Dict:
    """
    진입 전략 평가 — OBV + VCP 기반
    candles: 일봉 딕셔너리 리스트
    clusters: DTW 클러스터 (빈 리스트이면 스킵)
    strategy_config: {"skip_dtw": True} 등
    """
    if not candles or len(candles) < 20:
        return {"should_buy": False, "signals": [], "score": 0}

    config = strategy_config or {}
    signals = []
    score = 0

    # OBV (On-Balance Volume) 분석
    obv = 0
    obv_values = []
    for i in range(1, len(candles)):
        if candles[i]["close"] > candles[i - 1]["close"]:
            obv += candles[i]["volume"]
        elif candles[i]["close"] < candles[i - 1]["close"]:
            obv -= candles[i]["volume"]
        obv_values.append(obv)

    if len(obv_values) >= 5:
        recent_obv = obv_values[-5:]
        if all(recent_obv[j] > recent_obv[j - 1] for j in range(1, len(recent_obv))):
            signals.append("OBV 상승 추세")
            score += 30

    # VCP (Volatility Contraction Pattern) 분석
    if len(candles) >= 20:
        recent = candles[-20:]
        ranges = [(c["high"] - c["low"]) / c["close"] * 100 for c in recent if c["close"] > 0]
        if len(ranges) >= 10:
            first_half_avg = sum(ranges[:10]) / 10
            second_half_avg = sum(ranges[10:]) / len(ranges[10:])
            if second_half_avg < first_half_avg * 0.7:
                signals.append("VCP 수축 패턴")
                score += 30

    should_buy = score >= 50
    return {
        "should_buy": should_buy,
        "signals": signals,
        "score": score,
    }
