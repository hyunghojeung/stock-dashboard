"""
KIS 자동매매 전략 실행기 / KIS Auto-Trading Strategy Executor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
파일경로: src/kis_strategy_executor.py

KIS 모의/실전투자 보유종목을 통합 전략 엔진으로 평가하고,
매도 신호 발생 시 KIS API를 통해 실제 주문을 실행.

흐름:
  1. DB에서 전략 관리 중인 포지션 조회 (kis_managed_positions)
  2. KIS API로 현재가 조회
  3. strategy_engine.evaluate_position()으로 판단
  4. 매도 신호 → KIS API 시장가 매도 주문 실행
  5. 결과를 DB에 기록
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional

from strategy_engine import (
    evaluate_position,
    StrategyParams,
    PositionState,
    signal_to_db_status,
    SMART_DEFAULTS,
)
from kis_api import get_kis_client

logger = logging.getLogger(__name__)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# KIS 포지션 전략 관리 등록
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def register_kis_position(
    supabase,
    stock_code: str,
    stock_name: str,
    buy_price: float,
    buy_date: str,
    qty: int,
    strategy: str = "smart",
    account_type: str = "virtual",
    custom_params: Optional[Dict] = None,
) -> Dict:
    """
    KIS 보유종목에 전략을 연결하여 자동매매 관리 대상으로 등록

    Args:
        supabase: Supabase 클라이언트
        stock_code: 종목코드
        stock_name: 종목명
        buy_price: 매수가
        buy_date: 매수일 (YYYY-MM-DD)
        qty: 보유 수량
        strategy: 전략 유형 (smart/aggressive/standard/conservative/longterm)
        account_type: 계정 유형 (virtual/real)
        custom_params: 커스텀 전략 파라미터 (선택)
    """
    # 전략별 기본 파라미터
    presets = {
        "smart": {
            "stop_loss_pct": 12.0, "take_profit_pct": 0,
            "max_hold_days": 30, "trailing_stop_pct": 5.0,
            "profit_activation_pct": 15.0, "grace_days": 7,
        },
        "aggressive": {
            "stop_loss_pct": 5.0, "take_profit_pct": 10.0,
            "max_hold_days": 5, "trailing_stop_pct": 0,
            "profit_activation_pct": 0, "grace_days": 0,
        },
        "standard": {
            "stop_loss_pct": 3.0, "take_profit_pct": 7.0,
            "max_hold_days": 10, "trailing_stop_pct": 0,
            "profit_activation_pct": 0, "grace_days": 0,
        },
        "conservative": {
            "stop_loss_pct": 2.0, "take_profit_pct": 5.0,
            "max_hold_days": 15, "trailing_stop_pct": 0,
            "profit_activation_pct": 0, "grace_days": 0,
        },
        "longterm": {
            "stop_loss_pct": 5.0, "take_profit_pct": 15.0,
            "max_hold_days": 30, "trailing_stop_pct": 0,
            "profit_activation_pct": 0, "grace_days": 0,
        },
    }

    params = presets.get(strategy, presets["smart"])
    if custom_params:
        params.update(custom_params)

    pos_data = {
        "account_type": account_type,
        "stock_code": stock_code,
        "stock_name": stock_name,
        "buy_price": buy_price,
        "buy_date": buy_date,
        "current_price": buy_price,
        "peak_price": buy_price,
        "hold_days": 0,
        "strategy": strategy,
        "qty": qty,
        "status": "holding",
        "trailing_activated": False,
        **params,
    }

    try:
        result = supabase.table("kis_managed_positions").insert(pos_data).execute()
        logger.info(f"[KIS전략] 등록: {stock_name}({stock_code}) 전략={strategy} 수량={qty}")
        return {"success": True, "data": result.data}
    except Exception as e:
        logger.error(f"[KIS전략] 등록 실패: {e}")
        return {"error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# KIS 전략 체크 및 자동 매도 실행
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def check_and_execute_kis_positions(
    supabase,
    account_type: str = "virtual",
    auto_sell: bool = True,
) -> Dict:
    """
    KIS 관리 포지션을 전략 엔진으로 평가하고, 매도 신호 시 주문 실행

    Args:
        supabase: Supabase 클라이언트
        account_type: "virtual" (모의) 또는 "real" (실전)
        auto_sell: True면 매도 주문 자동 실행, False면 신호만 반환
    """
    client = get_kis_client()
    if not client.is_configured:
        return {"error": "KIS API 미설정"}

    try:
        # DB에서 전략 관리 포지션 조회
        managed = supabase.table("kis_managed_positions").select("*").eq(
            "account_type", account_type
        ).eq("status", "holding").execute()
        positions = managed.data or []

        if not positions:
            return {"account_type": account_type, "checked": 0, "results": []}

        results = []

        for pos in positions:
            code = pos["stock_code"]
            qty = int(pos.get("qty", 0))

            try:
                # KIS 현재가 조회 (장중 고가/저가 포함)
                quote = await client.get_current_price(code)
                q = quote.get("output", {})
                current_price = int(q.get("stck_prpr", "0"))
                high_price = int(q.get("stck_hgpr", "0"))
                low_price = int(q.get("stck_lwpr", "0"))

                if current_price <= 0:
                    continue

                # 전략 파라미터 구성
                strategy = pos.get("strategy", "smart")
                params = StrategyParams(
                    strategy_type=strategy,
                    stop_loss_pct=float(pos.get("stop_loss_pct", 12.0)),
                    take_profit_pct=float(pos.get("take_profit_pct", 0)),
                    max_hold_days=int(pos.get("max_hold_days", 30)),
                    trailing_stop_pct=float(pos.get("trailing_stop_pct", 5.0)),
                    profit_activation_pct=float(pos.get("profit_activation_pct", 15.0)),
                    grace_days=int(pos.get("grace_days", 7)),
                )

                # 보유일 계산
                buy_date = datetime.strptime(pos["buy_date"], "%Y-%m-%d")
                hold_days = (datetime.now() - buy_date).days

                # 포지션 상태
                state = PositionState(
                    buy_price=float(pos["buy_price"]),
                    hold_days=hold_days,
                    peak_price=float(pos.get("peak_price", pos["buy_price"])),
                    trailing_activated=bool(pos.get("trailing_activated", False)),
                )

                # ★ 통합 전략 판단
                signal = evaluate_position(state, current_price, high_price, low_price, params)

                pct = ((current_price - state.buy_price) / state.buy_price) * 100

                # peak_price, trailing_activated 상태 항상 업데이트
                update_data = {
                    "current_price": current_price,
                    "peak_price": signal.new_peak,
                    "hold_days": hold_days,
                    "trailing_activated": signal.trailing_activated,
                    "profit_pct": round(pct, 2),
                    "updated_at": datetime.now().isoformat(),
                }

                # 매도 신호 처리
                if signal.action != "HOLD":
                    result_entry = {
                        "stock_code": code,
                        "stock_name": pos.get("stock_name", ""),
                        "signal": signal.action,
                        "reason": signal.reason,
                        "current_price": current_price,
                        "buy_price": state.buy_price,
                        "profit_pct": round(pct, 2),
                        "qty": qty,
                    }

                    if auto_sell and qty > 0:
                        # KIS API 시장가 매도 주문
                        try:
                            order_result = await client.order_sell(
                                code, qty, price=0, order_type="01"
                            )
                            success = order_result.get("rt_cd") == "0"
                            result_entry["order_success"] = success
                            result_entry["order_no"] = order_result.get("output", {}).get("ODNO", "")
                            result_entry["order_message"] = order_result.get("msg1", "")

                            if success:
                                update_data["status"] = signal_to_db_status(signal.action)
                                update_data["sell_price"] = current_price
                                update_data["sell_date"] = datetime.now().strftime("%Y-%m-%d")
                                update_data["sell_reason"] = signal.reason

                                logger.info(
                                    f"[KIS전략] 매도 실행: {pos.get('stock_name')}({code}) "
                                    f"{signal.action} — {signal.reason} / 수익률 {pct:.1f}%"
                                )
                            else:
                                logger.warning(
                                    f"[KIS전략] 매도 주문 실패: {pos.get('stock_name')}({code}) "
                                    f"— {order_result.get('msg1', '')}"
                                )

                        except Exception as order_err:
                            result_entry["order_success"] = False
                            result_entry["error"] = str(order_err)
                            logger.error(f"[KIS전략] 주문 오류: {code} — {order_err}")
                    else:
                        result_entry["order_success"] = None
                        result_entry["note"] = "auto_sell=False, 신호만 반환"

                    results.append(result_entry)

                supabase.table("kis_managed_positions").update(update_data).eq(
                    "id", pos["id"]
                ).execute()

            except Exception as pos_err:
                logger.error(f"[KIS전략] 포지션 처리 오류: {code} — {pos_err}")
                results.append({
                    "stock_code": code,
                    "error": str(pos_err),
                })

        return {
            "account_type": account_type,
            "checked": len(positions),
            "signals_count": len(results),
            "results": results,
        }

    except Exception as e:
        logger.error(f"[KIS전략] 전체 오류: {e}")
        return {"error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# KIS 관리 포지션 조회
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def get_kis_managed_positions(
    supabase,
    account_type: str = "virtual",
    status: str = "all",
) -> Dict:
    """KIS 전략 관리 포지션 목록 조회"""
    try:
        query = supabase.table("kis_managed_positions").select("*").eq(
            "account_type", account_type
        )
        if status != "all":
            query = query.eq("status", status)

        result = query.order("created_at", desc=True).execute()
        positions = result.data or []

        holding = [p for p in positions if p["status"] == "holding"]
        closed = [p for p in positions if p["status"] != "holding"]

        return {
            "account_type": account_type,
            "total": len(positions),
            "holding_count": len(holding),
            "closed_count": len(closed),
            "positions": positions,
        }
    except Exception as e:
        logger.error(f"[KIS전략] 조회 오류: {e}")
        return {"error": str(e)}


async def remove_kis_managed_position(supabase, position_id: int) -> Dict:
    """KIS 전략 관리에서 포지션 제거 (실제 보유종목은 그대로)"""
    try:
        supabase.table("kis_managed_positions").delete().eq("id", position_id).execute()
        return {"success": True, "removed_id": position_id}
    except Exception as e:
        logger.error(f"[KIS전략] 제거 오류: {e}")
        return {"error": str(e)}


async def update_kis_strategy_params(
    supabase, position_id: int, params: Dict
) -> Dict:
    """KIS 관리 포지션의 전략 파라미터 변경"""
    allowed_fields = {
        "strategy", "stop_loss_pct", "take_profit_pct", "max_hold_days",
        "trailing_stop_pct", "profit_activation_pct", "grace_days",
    }
    update_data = {k: v for k, v in params.items() if k in allowed_fields}
    if not update_data:
        return {"error": "변경할 파라미터 없음"}

    try:
        update_data["updated_at"] = datetime.now().isoformat()
        supabase.table("kis_managed_positions").update(update_data).eq(
            "id", position_id
        ).execute()
        return {"success": True, "updated": update_data}
    except Exception as e:
        logger.error(f"[KIS전략] 파라미터 변경 오류: {e}")
        return {"error": str(e)}
