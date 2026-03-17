"""
가상투자 포트폴리오 관리 API / Virtual Portfolio Management Routes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
파일경로: src/virtual_portfolio_routes.py
엔드포인트:
  GET  /api/virtual-portfolio/list                  — 포트폴리오 목록
  GET  /api/virtual-portfolio/detail/{id}           — 포트폴리오 상세
  POST /api/virtual-portfolio/register              — 포트폴리오 등록
  POST /api/virtual-portfolio/update-prices/{id}    — 가격 갱신 + 자동 청산
  POST /api/virtual-portfolio/close/{id}            — 수동 전체 청산
  PUT  /api/virtual-portfolio/rename/{id}           — 제목 수정
  DELETE /api/virtual-portfolio/delete/{id}         — 삭제
  POST /api/virtual-portfolio/batch-delete          — 일괄 삭제
  GET  /api/virtual-portfolio/candles/{code}        — 일봉 조회
  GET  /api/virtual-portfolio/debug/time            — 서버 시간 확인
  POST /api/virtual-portfolio/fix-buy-prices        — 매수가 교정
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import datetime, timedelta, timezone
import logging

from app.utils.kr_holiday import is_market_open_now, KST
from app.services.naver_stock import get_daily_candles_naver, get_realtime_price_naver
from strategy_engine import (
    evaluate_position, StrategyParams, PositionState,
    signal_to_db_status, SMART_DEFAULTS,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/virtual-portfolio", tags=["virtual-portfolio"])

# 수수료율 (매수 0.015% + 매도 0.015% + 세금 0.18%)
COMMISSION_RATE = 0.00015
SELL_TAX_RATE = 0.0018

# Supabase 연결
try:
    from app.core.database import db as supabase
except Exception:
    supabase = None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 요청 모델
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class RegisterRequest(BaseModel):
    name: str = ""
    capital: float = 1000000
    strategy: str = "smart"
    stocks: List[dict]


class BatchDeleteRequest(BaseModel):
    ids: List[int]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 스마트형 기본 파라미터 구성 헬퍼
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def build_strategy_params(pos: dict, portfolio_strategy: str = "smart") -> StrategyParams:
    """
    포지션 데이터에서 전략 파라미터를 구성.
    ★ 핵심: strategy_type이 없거나 파라미터가 0이면 스마트형 기본값으로 폴백.
    ★ 모든 전략에 트레일링 스톱을 적용.
    """
    # 전략 유형 결정: 포지션 → 포트폴리오 → smart
    strategy_type = pos.get("strategy_type") or portfolio_strategy or "smart"

    # ★ 스마트형 기본값 (파라미터가 0이면 기본값 사용)
    stop_loss = float(pos.get("stop_loss_pct") or 0)
    trailing = float(pos.get("trailing_stop_pct") or 0)
    activation = float(pos.get("profit_activation_pct") or 0)
    grace = int(pos.get("grace_days") or 0)
    max_days = int(pos.get("max_hold_days") or 0)
    tp = float(pos.get("take_profit_pct") or 0)

    # ★ 파라미터가 0이면 스마트형 기본값 사용 (strategy_type 무관)
    if stop_loss <= 0:
        stop_loss = SMART_DEFAULTS["stop_loss_pct"]
    if trailing <= 0:
        trailing = SMART_DEFAULTS["trailing_stop_pct"]
    if activation <= 0:
        activation = SMART_DEFAULTS["profit_activation_pct"]
    if grace <= 0:
        grace = SMART_DEFAULTS["grace_days"]
    if max_days <= 0:
        max_days = SMART_DEFAULTS["max_hold_days"]

    # ★ 모든 전략을 smart로 강제 (트레일링 스톱 적용 보장)
    return StrategyParams(
        strategy_type="smart",
        stop_loss_pct=stop_loss,
        take_profit_pct=tp,
        max_hold_days=max_days,
        trailing_stop_pct=trailing,
        profit_activation_pct=activation,
        grace_days=grace,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 디버그
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/debug/time")
async def debug_time():
    """서버 시간 & 장 상태 확인"""
    now = datetime.now(KST)
    return {
        "server_time": now.isoformat(),
        "market_open": is_market_open_now(now),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 포트폴리오 등록
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/register")
async def register_portfolio(req: RegisterRequest):
    """매수추천 종목으로 가상투자 포트폴리오 등록"""
    if not supabase:
        return {"error": "DB 미연결"}

    now_kst = datetime.now(KST)
    now_str = now_kst.isoformat()
    market_open = is_market_open_now(now_kst)
    strategy = req.strategy or "smart"

    try:
        # 포트폴리오 생성
        pf_data = {
            "name": req.name or now_kst.strftime("%Y-%m-%d"),
            "capital": req.capital,
            "strategy": strategy,
            "status": "active",
            "stock_count": len(req.stocks),
            "current_value": req.capital,
            "created_at": now_str,
            "updated_at": now_str,
        }
        pf_res = supabase.table("virtual_portfolios").insert(pf_data).execute()
        if not pf_res.data:
            return {"error": "포트폴리오 생성 실패"}

        portfolio_id = pf_res.data[0]["id"]
        per_stock = req.capital / max(len(req.stocks), 1)

        positions = []
        for s in req.stocks:
            code = s.get("code", "")
            buy_price = 0

            # 실시간 매수가 조회
            try:
                if market_open:
                    rt = get_realtime_price_naver(code)
                    if rt and rt.get("price", 0) > 0:
                        buy_price = rt["price"]
                if buy_price <= 0:
                    candles = get_daily_candles_naver(code, count=3)
                    if candles:
                        buy_price = candles[-1].get("close", 0)
                if buy_price <= 0:
                    buy_price = s.get("buy_price", 0) or s.get("current_price", 0)
            except Exception:
                buy_price = s.get("buy_price", 0) or s.get("current_price", 0)

            if buy_price <= 0:
                continue

            qty = int(per_stock / buy_price)
            if qty <= 0:
                continue

            invest = qty * buy_price
            positions.append({
                "portfolio_id": portfolio_id,
                "code": code,
                "name": s.get("name", ""),
                "buy_price": buy_price,
                "current_price": buy_price,
                "quantity": qty,
                "invest_amount": invest,
                "status": "holding",
                "peak_price": buy_price,
                "similarity": s.get("similarity", 0),
                "signal": s.get("signal", ""),
                "buy_date": now_str,
                # ★ 스마트형 기본 파라미터
                "strategy_type": "smart",
                "take_profit_pct": 0.0,
                "stop_loss_pct": SMART_DEFAULTS["stop_loss_pct"],
                "max_hold_days": SMART_DEFAULTS["max_hold_days"],
                "trailing_stop_pct": SMART_DEFAULTS["trailing_stop_pct"],
                "profit_activation_pct": SMART_DEFAULTS["profit_activation_pct"],
                "grace_days": SMART_DEFAULTS["grace_days"],
                "trailing_activated": False,
                "pattern_id": s.get("pattern_id"),
                "pattern_name": s.get("pattern_name"),
            })

        if positions:
            supabase.table("virtual_positions").insert(positions).execute()
            total_invest = sum(p["invest_amount"] for p in positions)
            supabase.table("virtual_portfolios").update({
                "stock_count": len(positions),
            }).eq("id", portfolio_id).execute()

        return {
            "portfolio_id": portfolio_id,
            "message": f"{len(positions)}종목 등록 완료 (전략: {strategy})",
        }
    except Exception as e:
        logger.error(f"[가상투자] 포트폴리오 등록 실패: {e}")
        return {"error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 포트폴리오 목록
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/list")
async def list_portfolios():
    """등록된 포트폴리오 목록 (최신순)"""
    if not supabase:
        return {"portfolios": []}

    try:
        res = supabase.table("virtual_portfolios") \
            .select("*") \
            .order("created_at", desc=True) \
            .limit(100) \
            .execute()
        portfolios = res.data or []

        result = []
        for pf in portfolios:
            pid = pf["id"]
            pos_res = supabase.table("virtual_positions") \
                .select("*") \
                .eq("portfolio_id", pid) \
                .execute()
            positions = pos_res.data or []

            # 수익 집계
            total_invest = sum(float(p.get("invest_amount", 0)) for p in positions)
            total_value = 0
            total_return_won = 0

            for p in positions:
                qty = int(p.get("quantity", 0))
                buy_px = float(p.get("buy_price", 0))
                invest = float(p.get("invest_amount", 0))

                if p["status"] == "holding":
                    cur = float(p.get("current_price", buy_px))
                    total_value += cur * qty
                    total_return_won += (cur * qty) - invest
                else:
                    sell_px = float(p.get("sell_price", buy_px))
                    total_value += sell_px * qty
                    total_return_won += float(p.get("profit_won", 0))

            pct = (total_return_won / total_invest * 100) if total_invest > 0 else 0

            # 승/패 집계
            win = sum(1 for p in positions if p["status"] != "holding" and float(p.get("profit_won", 0)) > 0)
            loss = sum(1 for p in positions if p["status"] != "holding" and float(p.get("profit_won", 0)) <= 0)

            result.append({
                **pf,
                "stock_count": len(positions),
                "total_return_pct": round(pct, 2),
                "total_return_won": round(total_return_won),
                "current_value": round(total_value),
                "win_count": win,
                "loss_count": loss,
                "positions_summary": [{
                    "portfolio_id": pid,
                    "code": p.get("code", ""),
                    "name": p.get("name", ""),
                    "status": p["status"],
                    "profit_pct": round(((float(p.get("current_price", 0)) - float(p.get("buy_price", 1))) / float(p.get("buy_price", 1)) * 100), 2) if p["status"] == "holding" else round(float(p.get("profit_pct", 0)), 2),
                    "pattern_id": p.get("pattern_id"),
                    "pattern_name": p.get("pattern_name"),
                } for p in positions],
            })

        return {"portfolios": result}
    except Exception as e:
        logger.error(f"[가상투자] 목록 조회 실패: {e}")
        return {"portfolios": [], "error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 포트폴리오 상세
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/detail/{portfolio_id}")
async def get_portfolio_detail(portfolio_id: int):
    """포트폴리오 상세 + 종목별 포지션"""
    if not supabase:
        return {"error": "DB 미연결"}

    try:
        pf_res = supabase.table("virtual_portfolios").select("*").eq("id", portfolio_id).single().execute()
        pf = pf_res.data

        pos_res = supabase.table("virtual_positions").select("*").eq("portfolio_id", portfolio_id).execute()
        positions = pos_res.data or []

        # 가격 히스토리 조합
        for p in positions:
            try:
                candles = get_daily_candles_naver(p["code"], count=5)
                p["price_history"] = candles if candles else []
            except Exception:
                p["price_history"] = []

            # 보유일 계산
            buy_date_str = p.get("buy_date", "")
            if buy_date_str:
                try:
                    buy_dt = datetime.fromisoformat(buy_date_str.replace("Z", "+00:00"))
                    p["hold_days"] = (datetime.now(timezone.utc) - buy_dt).days
                except Exception:
                    p["hold_days"] = 0

        return {"portfolio": pf, "positions": positions}
    except Exception as e:
        return {"error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ★ 핵심: 가격 갱신 + 자동 청산
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/update-prices/{portfolio_id}")
async def update_prices(portfolio_id: int):
    """
    네이버에서 최신 가격 가져와 포지션 업데이트 + 자동 청산 체크
    ★ v8: 장중이면 실시간 체결가 우선 사용 (일봉 종가와의 괴리 방지)
    ★ v11: 모든 전략에 트레일링 스톱(스마트형) 적용
    """
    if not supabase:
        return {"error": "DB 미연결"}

    try:
        # 포트폴리오 정보
        pf_res = supabase.table("virtual_portfolios").select("*").eq("id", portfolio_id).single().execute()
        pf = pf_res.data
        if not pf:
            return {"error": "포트폴리오 없음"}

        portfolio_strategy = pf.get("strategy", "smart")

        # 활성 포지션 조회
        pos_res = supabase.table("virtual_positions").select("*") \
            .eq("portfolio_id", portfolio_id) \
            .eq("status", "holding") \
            .execute()
        positions = pos_res.data or []

        if not positions:
            return {"success": True, "updated": 0, "closed": 0}

        market_open = is_market_open_now()
        updated = 0
        closed = 0
        total_return_won = 0
        total_invest = 0

        for pos in positions:
            code = pos["code"]
            buy_price = float(pos["buy_price"])
            invest = float(pos.get("invest_amount", 0))
            qty = int(pos.get("quantity", 0))
            total_invest += invest

            # 현재가 조회
            current_price = 0
            high_price = 0
            low_price = 0

            try:
                if market_open:
                    rt = get_realtime_price_naver(code)
                    if rt and rt.get("price", 0) > 0:
                        current_price = rt["price"]
                        high_price = rt.get("high", current_price)
                        low_price = rt.get("low", current_price)

                if current_price <= 0:
                    candles = get_daily_candles_naver(code, count=5)
                    if candles:
                        latest = candles[-1]
                        current_price = latest.get("close", 0)
                        high_price = latest.get("high", current_price)
                        low_price = latest.get("low", current_price)
            except Exception as e:
                logger.warning(f"[{code}] 가격 조회 실패: {e}")
                continue

            if current_price <= 0:
                continue

            # 보유일 계산
            buy_date_str = pos.get("buy_date", "")
            hold_days = 0
            if buy_date_str:
                try:
                    buy_dt = datetime.fromisoformat(buy_date_str.replace("Z", "+00:00"))
                    hold_days = (datetime.now(timezone.utc) - buy_dt).days
                except Exception:
                    hold_days = 0

            # ★ 전략 파라미터 구성 (스마트형 기본값 + 트레일링 스톱 강제 적용)
            params = build_strategy_params(pos, portfolio_strategy)

            # 포지션 상태 구성
            state = PositionState(
                buy_price=buy_price,
                hold_days=hold_days,
                peak_price=float(pos.get("peak_price") or buy_price),
                trailing_activated=bool(pos.get("trailing_activated", False)),
            )

            # ★ 통합 전략 엔진으로 매도/보유 판단
            signal = evaluate_position(state, current_price, high_price, low_price, params)

            pct = ((current_price - buy_price) / buy_price) * 100
            return_won = (current_price * qty) - invest

            # DB 업데이트 데이터
            update_data = {
                "current_price": current_price,
                "hold_days": hold_days,
                "profit_pct": round(pct, 2),
                "peak_price": signal.new_peak,
                "trailing_activated": signal.trailing_activated,
                "updated_at": datetime.now(KST).isoformat(),
            }

            # 매도 신호 처리
            if signal.action != "HOLD":
                sell_price = signal.sell_price
                sell_amount = sell_price * qty
                costs = sell_amount * (COMMISSION_RATE + SELL_TAX_RATE) + invest * COMMISSION_RATE
                profit_won = round(sell_amount - invest - costs)

                update_data["status"] = signal_to_db_status(signal.action)
                update_data["sell_price"] = sell_price
                update_data["sell_date"] = datetime.now(KST).strftime("%Y-%m-%d")
                update_data["sell_reason"] = signal.reason
                update_data["profit_won"] = profit_won

                # ★ 포지션의 strategy_type도 smart로 교정
                update_data["strategy_type"] = "smart"
                update_data["trailing_stop_pct"] = params.trailing_stop_pct
                update_data["profit_activation_pct"] = params.profit_activation_pct
                update_data["grace_days"] = params.grace_days
                update_data["stop_loss_pct"] = params.stop_loss_pct
                update_data["max_hold_days"] = params.max_hold_days

                total_return_won += profit_won
                closed += 1

                logger.info(
                    f"[가상포트] 매도: {pos.get('name','')}({code}) "
                    f"{signal.action} — {signal.reason} / 수익 {profit_won:,}원"
                )
            else:
                total_return_won += return_won

                # ★ 보유 중에도 strategy_type이 잘못되어 있으면 교정
                if pos.get("strategy_type") != "smart" or float(pos.get("trailing_stop_pct") or 0) <= 0:
                    update_data["strategy_type"] = "smart"
                    update_data["trailing_stop_pct"] = params.trailing_stop_pct
                    update_data["profit_activation_pct"] = params.profit_activation_pct
                    update_data["grace_days"] = params.grace_days
                    update_data["stop_loss_pct"] = params.stop_loss_pct
                    update_data["max_hold_days"] = params.max_hold_days

            # DB 업데이트
            supabase.table("virtual_positions").update(update_data).eq("id", pos["id"]).execute()
            updated += 1

        # 포트폴리오 합산 업데이트
        total_pct = (total_return_won / total_invest * 100) if total_invest > 0 else 0
        pf_update = {
            "total_return_pct": round(total_pct, 2),
            "total_return_won": round(total_return_won),
            "updated_at": datetime.now(KST).isoformat(),
        }
        if closed > 0:
            # 모든 포지션 청산 여부 확인
            remaining = supabase.table("virtual_positions").select("id") \
                .eq("portfolio_id", portfolio_id).eq("status", "holding").execute()
            if not remaining.data:
                pf_update["status"] = "closed"

        supabase.table("virtual_portfolios").update(pf_update).eq("id", portfolio_id).execute()

        return {
            "success": True,
            "updated": updated,
            "closed": closed,
            "total_return_pct": round(total_pct, 2),
            "total_return_won": round(total_return_won),
            "status": "active" if closed < updated else "closed",
        }

    except Exception as e:
        logger.error(f"[가상포트] 가격 갱신 실패: {e}")
        return {"error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 수동 청산
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/close/{portfolio_id}")
async def close_portfolio(portfolio_id: int):
    """포트폴리오 전체 수동 청산"""
    if not supabase:
        return {"error": "DB 미연결"}

    try:
        pos_res = supabase.table("virtual_positions").select("*") \
            .eq("portfolio_id", portfolio_id).eq("status", "holding").execute()

        for pos in (pos_res.data or []):
            code = pos["code"]
            buy_price = float(pos["buy_price"])
            qty = int(pos.get("quantity", 0))
            invest = float(pos.get("invest_amount", 0))

            # 현재가 조회
            current_price = buy_price
            try:
                candles = get_daily_candles_naver(code, count=3)
                if candles:
                    current_price = candles[-1].get("close", buy_price)
            except Exception:
                pass

            sell_amount = current_price * qty
            costs = sell_amount * (COMMISSION_RATE + SELL_TAX_RATE) + invest * COMMISSION_RATE
            profit_won = round(sell_amount - invest - costs)
            pct = ((current_price - buy_price) / buy_price * 100) if buy_price > 0 else 0

            supabase.table("virtual_positions").update({
                "status": "sold_manual",
                "sell_price": current_price,
                "sell_date": datetime.now(KST).strftime("%Y-%m-%d"),
                "sell_reason": "수동 청산",
                "profit_won": profit_won,
                "profit_pct": round(pct, 2),
                "current_price": current_price,
            }).eq("id", pos["id"]).execute()

        supabase.table("virtual_portfolios").update({
            "status": "closed",
            "updated_at": datetime.now(KST).isoformat(),
        }).eq("id", portfolio_id).execute()

        return {"success": True, "message": "전체 청산 완료"}
    except Exception as e:
        return {"error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 제목 수정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.put("/rename/{portfolio_id}")
async def rename_portfolio(portfolio_id: int, body: dict):
    """포트폴리오 제목 수정"""
    if not supabase:
        return {"error": "DB 미연결"}
    name = body.get("name", "").strip()
    if not name:
        return {"error": "이름이 비어있음"}

    supabase.table("virtual_portfolios").update({
        "name": name,
        "updated_at": datetime.now(KST).isoformat(),
    }).eq("id", portfolio_id).execute()
    return {"success": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 삭제
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete("/delete/{portfolio_id}")
async def delete_portfolio(portfolio_id: int):
    """포트폴리오 영구 삭제 (CASCADE로 포지션도 삭제)"""
    if not supabase:
        return {"error": "DB 미연결"}
    supabase.table("virtual_positions").delete().eq("portfolio_id", portfolio_id).execute()
    supabase.table("virtual_portfolios").delete().eq("id", portfolio_id).execute()
    return {"success": True}


@router.post("/batch-delete")
async def batch_delete_portfolios(req: BatchDeleteRequest):
    """여러 포트폴리오 일괄 삭제"""
    if not supabase:
        return {"error": "DB 미연결"}
    for pid in req.ids:
        supabase.table("virtual_positions").delete().eq("portfolio_id", pid).execute()
        supabase.table("virtual_portfolios").delete().eq("id", pid).execute()
    return {"success": True, "deleted": len(req.ids)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 일봉 조회
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/candles/{code}")
async def get_candles(code: str, days: int = 60):
    """네이버에서 일봉 캔들 데이터 조회"""
    try:
        candles = get_daily_candles_naver(code, count=days)
        return {"candles": candles or []}
    except Exception as e:
        return {"candles": [], "error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 매수가 교정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/fix-buy-prices")
async def fix_buy_prices():
    """기존 포지션의 buy_price를 네이버 종가로 교정"""
    if not supabase:
        return {"error": "DB 미연결"}

    try:
        res = supabase.table("virtual_positions").select("*").eq("status", "holding").execute()
        fixed = 0

        for pos in (res.data or []):
            code = pos["code"]
            buy_price = float(pos.get("buy_price", 0))
            if buy_price > 0:
                continue

            candles = get_daily_candles_naver(code, count=5)
            if candles:
                new_price = candles[-1].get("close", 0)
                if new_price > 0:
                    supabase.table("virtual_positions").update({
                        "buy_price": new_price,
                        "current_price": new_price,
                        "peak_price": new_price,
                    }).eq("id", pos["id"]).execute()
                    fixed += 1

        return {"success": True, "fixed": fixed}
    except Exception as e:
        return {"error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ★ 기존 포지션 일괄 스마트형 교정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/fix-strategy")
async def fix_strategy():
    """
    기존 모든 보유중(holding) 포지션에 스마트형 전략 + 트레일링 강제 적용.
    strategy_type이 'smart'가 아니거나 trailing_stop_pct가 0인 포지션을 교정.
    포트폴리오의 strategy도 'smart'로 교정.
    """
    if not supabase:
        return {"error": "DB 미연결"}

    try:
        # 1) 보유중 포지션 중 스마트형이 아닌 것 교정
        res = supabase.table("virtual_positions").select("*").eq("status", "holding").execute()
        fixed_positions = 0

        for pos in (res.data or []):
            needs_fix = (
                pos.get("strategy_type") != "smart"
                or float(pos.get("trailing_stop_pct") or 0) <= 0
                or float(pos.get("profit_activation_pct") or 0) <= 0
                or float(pos.get("stop_loss_pct") or 0) <= 0
            )
            if not needs_fix:
                continue

            update_data = {
                "strategy_type": "smart",
                "take_profit_pct": 0.0,
                "stop_loss_pct": SMART_DEFAULTS["stop_loss_pct"],
                "trailing_stop_pct": SMART_DEFAULTS["trailing_stop_pct"],
                "profit_activation_pct": SMART_DEFAULTS["profit_activation_pct"],
                "grace_days": SMART_DEFAULTS["grace_days"],
                "max_hold_days": SMART_DEFAULTS["max_hold_days"],
            }
            supabase.table("virtual_positions").update(update_data).eq("id", pos["id"]).execute()
            fixed_positions += 1
            logger.info(f"[전략교정] {pos.get('name','')}({pos.get('code','')}) → 스마트형 적용")

        # 2) 포트폴리오 strategy도 smart로 교정
        pf_res = supabase.table("virtual_portfolios").select("id, strategy").eq("status", "active").execute()
        fixed_portfolios = 0
        for pf in (pf_res.data or []):
            if pf.get("strategy") != "smart":
                supabase.table("virtual_portfolios").update({
                    "strategy": "smart",
                    "updated_at": datetime.now(KST).isoformat(),
                }).eq("id", pf["id"]).execute()
                fixed_portfolios += 1

        return {
            "success": True,
            "fixed_positions": fixed_positions,
            "fixed_portfolios": fixed_portfolios,
            "message": f"포지션 {fixed_positions}개, 포트폴리오 {fixed_portfolios}개 스마트형 교정 완료",
        }
    except Exception as e:
        logger.error(f"[전략교정] 실패: {e}")
        return {"error": str(e)}
