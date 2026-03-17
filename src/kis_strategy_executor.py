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
# 서버 자동매매 로그 DB 저장
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def save_server_log(supabase, log_type: str, message: str, account_type: str = "virtual", details: dict = None):
    """서버 자동매매 실행 로그를 DB에 저장"""
    try:
        supabase.table("server_auto_trade_logs").insert({
            "log_type": log_type,
            "account_type": account_type,
            "message": message,
            "details": details or {},
        }).execute()
    except Exception as e:
        logger.error(f"[서버로그] DB 저장 실패: {e}")


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
            "stop_loss_pct": 10.0, "take_profit_pct": 0,
            "max_hold_days": 30, "trailing_stop_pct": 5.0,
            "profit_activation_pct": 10.0, "grace_days": 7,
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
        save_server_log(supabase, "warning", "KIS API 미설정 — 전략 체크 건너뜀", account_type)
        return {"error": "KIS API 미설정"}

    try:
        # DB에서 전략 관리 포지션 조회
        managed = supabase.table("kis_managed_positions").select("*").eq(
            "account_type", account_type
        ).eq("status", "holding").execute()
        positions = managed.data or []

        if not positions:
            save_server_log(supabase, "info", f"전략 체크 실행 — 관리 포지션 0건 (건너뜀)", account_type)
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

                # 전략 파라미터 구성 — ★ 모든 전략에 스마트형(트레일링 스톱) 강제 적용
                from strategy_engine import SMART_DEFAULTS
                raw_sl = float(pos.get("stop_loss_pct") or 0)
                raw_trail = float(pos.get("trailing_stop_pct") or 0)
                raw_activ = float(pos.get("profit_activation_pct") or 0)
                raw_grace = int(pos.get("grace_days") or 0)
                raw_days = int(pos.get("max_hold_days") or 0)
                params = StrategyParams(
                    strategy_type="smart",
                    stop_loss_pct=raw_sl if raw_sl > 0 else SMART_DEFAULTS["stop_loss_pct"],
                    take_profit_pct=float(pos.get("take_profit_pct", 0)),
                    max_hold_days=raw_days if raw_days > 0 else SMART_DEFAULTS["max_hold_days"],
                    trailing_stop_pct=raw_trail if raw_trail > 0 else SMART_DEFAULTS["trailing_stop_pct"],
                    profit_activation_pct=raw_activ if raw_activ > 0 else SMART_DEFAULTS["profit_activation_pct"],
                    grace_days=raw_grace if raw_grace > 0 else SMART_DEFAULTS["grace_days"],
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

                                sell_msg = f"✅ 매도 실행: {pos.get('stock_name')}({code}) [{signal.action}] {signal.reason} / 수익률 {pct:+.1f}%"
                                logger.info(f"[KIS전략] {sell_msg}")
                                save_server_log(supabase, "sell", sell_msg, account_type, {
                                    "stock_code": code, "stock_name": pos.get("stock_name"),
                                    "signal": signal.action, "reason": signal.reason,
                                    "profit_pct": round(pct, 2), "sell_price": current_price,
                                    "qty": qty, "order_no": result_entry.get("order_no", ""),
                                })
                            else:
                                fail_msg = f"❌ 매도 주문 실패: {pos.get('stock_name')}({code}) — {order_result.get('msg1', '')}"
                                logger.warning(f"[KIS전략] {fail_msg}")
                                save_server_log(supabase, "error", fail_msg, account_type, {
                                    "stock_code": code, "stock_name": pos.get("stock_name"),
                                    "msg": order_result.get("msg1", ""),
                                })

                        except Exception as order_err:
                            result_entry["order_success"] = False
                            result_entry["error"] = str(order_err)
                            err_msg = f"❌ 주문 오류: {pos.get('stock_name')}({code}) — {order_err}"
                            logger.error(f"[KIS전략] {err_msg}")
                            save_server_log(supabase, "error", err_msg, account_type)
                    else:
                        result_entry["order_success"] = None
                        result_entry["note"] = "auto_sell=False, 신호만 반환"

                    results.append(result_entry)

                supabase.table("kis_managed_positions").update(update_data).eq(
                    "id", pos["id"]
                ).execute()

            except Exception as pos_err:
                logger.error(f"[KIS전략] 포지션 처리 오류: {code} — {pos_err}")
                save_server_log(supabase, "error", f"포지션 처리 오류: {code} — {pos_err}", account_type)
                results.append({
                    "stock_code": code,
                    "error": str(pos_err),
                })

        # 체크 완료 요약 로그
        signal_count = len(results)
        hold_names = [f"{p.get('stock_name','')}" for p in positions]
        summary = f"전략 체크 완료: {len(positions)}종목 체크, 매도신호 {signal_count}건"
        if signal_count == 0 and positions:
            summary += f" — 전종목 유지 ({', '.join(hold_names[:5])})"
        save_server_log(supabase, "check", summary, account_type, {
            "checked": len(positions), "signals": signal_count,
            "positions": [{"code": p.get("stock_code"), "name": p.get("stock_name"),
                          "profit_pct": round(((int(p.get("current_price", 0)) - float(p.get("buy_price", 1))) / float(p.get("buy_price", 1))) * 100, 2) if float(p.get("buy_price", 1)) > 0 else 0}
                         for p in positions],
        })

        # ★ 매도가 발생했으면 자동으로 예비후보 매수 실행
        auto_buy_result = None
        sold_count = sum(1 for r in results if r.get("order_success") is True)
        if sold_count > 0 and auto_sell:
            try:
                auto_buy_result = await auto_invest_from_candidates(supabase, account_type)
                buy_msg = f"자동매수: 매도 {sold_count}건 → {auto_buy_result.get('action', 'unknown')}"
                if auto_buy_result.get("stock_name"):
                    buy_msg += f" ({auto_buy_result['stock_name']} {auto_buy_result.get('qty', 0)}주)"
                logger.info(f"[자동투자] {buy_msg}")
                save_server_log(supabase, "buy", buy_msg, account_type, auto_buy_result)
            except Exception as auto_err:
                logger.error(f"[자동투자] 자동매수 오류: {auto_err}")
                save_server_log(supabase, "error", f"자동매수 오류: {auto_err}", account_type)
                auto_buy_result = {"error": str(auto_err)}

        return {
            "account_type": account_type,
            "checked": len(positions),
            "signals_count": len(results),
            "results": results,
            "auto_buy": auto_buy_result,
        }

    except Exception as e:
        logger.error(f"[KIS전략] 전체 오류: {e}")
        save_server_log(supabase, "error", f"전략 체크 전체 오류: {e}", account_type)
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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 자동 투자: 매도 후 예비후보 자동 매수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def auto_invest_from_candidates(
    supabase,
    account_type: str = "virtual",
) -> Dict:
    """
    매도 후 예수금이 있으면 예비후보 종목에서 종합 판단하여 자동 매수

    종목 선정 기준 (종합 판단):
    - composite_score (종합점수) 높은 순
    - entry_score (진입점수) 높은 순
    - change_rate (당일 변동률) 고려
    - 예수금 전액 투자
    - 보유 제한 없음
    """
    client = get_kis_client()
    if not client.is_configured:
        return {"error": "KIS API 미설정"}

    try:
        # 1) 예수금 조회
        balance = await client.get_balance()
        deposit = 0
        if balance.get("output2"):
            for out in balance["output2"]:
                d = int(out.get("dnca_tot_amt", "0") or "0")
                if d > 0:
                    deposit = d
                    break
        if deposit <= 0:
            return {"account_type": account_type, "action": "skip", "reason": "예수금 없음", "deposit": 0}

        # 2) 예비후보 종목 로드 (종합점수 내림차순)
        cands_result = supabase.table("buy_candidates").select("*").eq(
            "status", "active"
        ).order("composite_score", desc=True).limit(20).execute()
        candidates = cands_result.data or []

        if not candidates:
            return {"account_type": account_type, "action": "skip", "reason": "예비후보 없음", "deposit": deposit}

        # 3) 이미 보유 중인 종목 제외
        managed = supabase.table("kis_managed_positions").select("stock_code").eq(
            "account_type", account_type
        ).eq("status", "holding").execute()
        holding_codes = set(p["stock_code"] for p in (managed.data or []))

        # 4) 종합 판단 점수 계산 후 최적 종목 선정
        scored = []
        for c in candidates:
            if c["code"] in holding_codes:
                continue
            # 종합 점수: composite_score(40%) + entry_score(40%) + 상승률 보너스(20%)
            comp = float(c.get("composite_score", 0) or 0)
            entry = float(c.get("entry_score", 0) or 0)
            chg = float(c.get("change_rate", 0) or 0)
            # 상승 중인 종목 가산 (하락 중이면 감산)
            chg_bonus = min(max(chg, -10), 10) * 2  # -20 ~ +20 범위
            total = comp * 0.4 + entry * 0.4 + chg_bonus * 0.2
            scored.append({"candidate": c, "total_score": total})

        if not scored:
            return {"account_type": account_type, "action": "skip", "reason": "매수 가능한 후보 없음", "deposit": deposit}

        scored.sort(key=lambda x: x["total_score"], reverse=True)
        best = scored[0]["candidate"]

        # 5) 현재가 조회
        try:
            quote = await client.get_current_price(best["code"])
            q = quote.get("output", {})
            current_price = int(q.get("stck_prpr", "0"))
        except Exception:
            current_price = int(best.get("current_price", 0) or 0)

        if current_price <= 0:
            return {"account_type": account_type, "action": "skip", "reason": "현재가 조회 실패", "deposit": deposit}

        # 6) 예수금 전액으로 매수 가능 수량 계산
        qty = deposit // current_price
        if qty <= 0:
            return {
                "account_type": account_type, "action": "skip",
                "reason": f"예수금 부족 (예수금: {deposit:,}원, {best['name']} 현재가: {current_price:,}원)",
                "deposit": deposit,
            }

        # 7) 시장가 매수 주문
        try:
            order_result = await client.order_buy(best["code"], qty, price=0, order_type="01")
            success = order_result.get("rt_cd") == "0"
            order_no = order_result.get("output", {}).get("ODNO", "")

            if success:
                # 8) 전략 자동 등록 (스마트형)
                await register_kis_position(
                    supabase=supabase,
                    stock_code=best["code"],
                    stock_name=best["name"],
                    buy_price=current_price,
                    buy_date=datetime.now().strftime("%Y-%m-%d"),
                    qty=qty,
                    strategy="smart",
                    account_type=account_type,
                )

                logger.info(
                    f"[자동투자] 매수 실행: {best['name']}({best['code']}) "
                    f"{qty}주 × {current_price:,}원 = {qty * current_price:,}원 "
                    f"(예수금: {deposit:,}원, 종합점수: {scored[0]['total_score']:.1f})"
                )

                return {
                    "account_type": account_type,
                    "action": "buy",
                    "stock_code": best["code"],
                    "stock_name": best["name"],
                    "qty": qty,
                    "price": current_price,
                    "total_amount": qty * current_price,
                    "deposit_before": deposit,
                    "deposit_after": deposit - (qty * current_price),
                    "order_no": order_no,
                    "strategy": "smart",
                    "total_score": scored[0]["total_score"],
                }
            else:
                logger.warning(f"[자동투자] 매수 주문 실패: {best['name']} — {order_result.get('msg1', '')}")
                return {
                    "account_type": account_type, "action": "failed",
                    "reason": order_result.get("msg1", "주문 실패"),
                    "stock_name": best["name"],
                }
        except Exception as buy_err:
            logger.error(f"[자동투자] 매수 오류: {best['name']} — {buy_err}")
            return {"account_type": account_type, "action": "error", "reason": str(buy_err)}

    except Exception as e:
        logger.error(f"[자동투자] 전체 오류: {e}")
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
