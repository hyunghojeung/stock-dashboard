"""
KIS Open API FastAPI 라우터
- 인증 설정, 주문, 잔고, 시세, 순위, 재무제표
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from kis_api import get_kis_client, reset_kis_client, KISClient
from kis_strategy_executor import (
    register_kis_position,
    check_and_execute_kis_positions,
    get_kis_managed_positions,
    remove_kis_managed_position,
    update_kis_strategy_params,
    auto_invest_from_candidates,
)

router = APIRouter(prefix="/api/kis", tags=["KIS 모의투자"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Request Models
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class KISConfigRequest(BaseModel):
    app_key: str
    app_secret: str
    account_no: str
    is_virtual: bool = True


class OrderRequest(BaseModel):
    stock_code: str
    qty: int
    price: int = 0
    order_type: str = "00"  # 00=지정가, 01=시장가


class CancelRequest(BaseModel):
    org_order_no: str
    stock_code: str
    qty: int
    price: int = 0


class ModifyRequest(BaseModel):
    org_order_no: str
    stock_code: str
    qty: int
    price: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 인증/설정
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/status")
async def kis_status():
    """KIS API 연결 상태 확인"""
    client = get_kis_client()
    configured = client.is_configured
    token_valid = client._access_token is not None and client._token_expires and datetime.now() < client._token_expires

    return {
        "configured": configured,
        "token_valid": token_valid,
        "is_virtual": client.is_virtual,
        "account_no": client.account_no[:4] + "****" + client.account_no[-2:] if client.account_no else "",
        "token_expires": client._token_expires.isoformat() if client._token_expires else None,
    }


@router.post("/config")
async def set_kis_config(req: KISConfigRequest):
    """KIS API 키 설정"""
    try:
        client = reset_kis_client(req.app_key, req.app_secret, req.account_no, req.is_virtual)
        token = await client.get_access_token()
        return {
            "success": True,
            "message": "KIS API 설정 완료",
            "token_preview": token[:20] + "...",
            "is_virtual": client.is_virtual,
        }
    except Exception as e:
        raise HTTPException(400, f"KIS API 설정 실패: {str(e)}")


@router.post("/token")
async def refresh_token():
    """토큰 재발급"""
    client = get_kis_client()
    if not client.is_configured:
        raise HTTPException(400, "KIS API 키가 설정되지 않았습니다")
    client._access_token = None
    token = await client.get_access_token()
    return {"success": True, "expires": client._token_expires.isoformat()}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1단계: 모의투자 매매
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _require_configured():
    client = get_kis_client()
    if not client.is_configured:
        raise HTTPException(400, "KIS API 키가 설정되지 않았습니다. 먼저 /api/kis/config 으로 설정하세요.")
    return client


@router.post("/order/buy")
async def order_buy(req: OrderRequest):
    """매수 주문"""
    client = _require_configured()
    try:
        result = await client.order_buy(req.stock_code, req.qty, req.price, req.order_type)
        success = result.get("rt_cd") == "0"
        return {
            "success": success,
            "message": result.get("msg1", ""),
            "order_no": result.get("output", {}).get("ODNO", ""),
            "data": result.get("output", {}),
            "raw": result,
        }
    except Exception as e:
        raise HTTPException(500, f"매수 주문 실패: {str(e)}")


@router.post("/order/sell")
async def order_sell(req: OrderRequest):
    """매도 주문"""
    client = _require_configured()
    try:
        result = await client.order_sell(req.stock_code, req.qty, req.price, req.order_type)
        success = result.get("rt_cd") == "0"
        return {
            "success": success,
            "message": result.get("msg1", ""),
            "order_no": result.get("output", {}).get("ODNO", ""),
            "data": result.get("output", {}),
            "raw": result,
        }
    except Exception as e:
        raise HTTPException(500, f"매도 주문 실패: {str(e)}")


@router.post("/order/cancel")
async def order_cancel(req: CancelRequest):
    """주문 취소"""
    client = _require_configured()
    try:
        result = await client.order_cancel(req.org_order_no, req.stock_code, req.qty, req.price)
        success = result.get("rt_cd") == "0"
        return {"success": success, "message": result.get("msg1", ""), "data": result.get("output", {})}
    except Exception as e:
        raise HTTPException(500, f"주문 취소 실패: {str(e)}")


@router.post("/order/modify")
async def order_modify(req: ModifyRequest):
    """주문 정정"""
    client = _require_configured()
    try:
        result = await client.order_modify(req.org_order_no, req.stock_code, req.qty, req.price)
        success = result.get("rt_cd") == "0"
        return {"success": success, "message": result.get("msg1", ""), "data": result.get("output", {})}
    except Exception as e:
        raise HTTPException(500, f"주문 정정 실패: {str(e)}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 잔고/체결
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/balance")
async def get_balance():
    """잔고 조회 (보유종목 + 예수금)"""
    client = _require_configured()
    try:
        result = await client.get_balance()
        holdings = result.get("output1", [])
        summary = result.get("output2", [{}])[0] if result.get("output2") else {}

        # 보유종목 정리
        positions = []
        for h in holdings:
            if int(h.get("hldg_qty", "0")) > 0:
                positions.append({
                    "stock_code": h.get("pdno", ""),
                    "stock_name": h.get("prdt_name", ""),
                    "qty": int(h.get("hldg_qty", "0")),
                    "avg_price": float(h.get("pchs_avg_pric", "0")),
                    "current_price": int(h.get("prpr", "0")),
                    "eval_amount": int(h.get("evlu_amt", "0")),
                    "profit_loss": int(h.get("evlu_pfls_amt", "0")),
                    "profit_rate": float(h.get("evlu_pfls_rt", "0")),
                    "buy_amount": int(h.get("pchs_amt", "0")),
                })

        return {
            "success": True,
            "positions": positions,
            "summary": {
                "total_eval": int(summary.get("tot_evlu_amt", "0")),
                "total_profit": int(summary.get("evlu_pfls_smtl_amt", "0")),
                "deposit": int(summary.get("dnca_tot_amt", "0")),
                "total_buy": int(summary.get("pchs_amt_smtl_amt", "0")),
                "profit_rate": float(summary.get("tot_evlu_pfls_rt", "0")) if summary.get("tot_evlu_pfls_rt") else 0,
            },
        }
    except Exception as e:
        raise HTTPException(500, f"잔고 조회 실패: {str(e)}")


@router.get("/orders")
async def get_orders(
    start_date: str = Query("", description="조회 시작일 YYYYMMDD"),
    end_date: str = Query("", description="조회 종료일 YYYYMMDD"),
):
    """체결내역 조회"""
    client = _require_configured()
    try:
        result = await client.get_order_history(start_date, end_date)
        orders = []
        for o in result.get("output1", []):
            orders.append({
                "order_no": o.get("odno", ""),
                "order_date": o.get("ord_dt", ""),
                "order_time": o.get("ord_tmd", ""),
                "stock_code": o.get("pdno", ""),
                "stock_name": o.get("prdt_name", ""),
                "side": "매수" if o.get("sll_buy_dvsn_cd") == "02" else "매도",
                "order_qty": int(o.get("ord_qty", "0")),
                "order_price": int(o.get("ord_unpr", "0")),
                "exec_qty": int(o.get("tot_ccld_qty", "0")),
                "exec_price": int(o.get("avg_prvs", "0")),
                "status": o.get("ord_dvsn_name", ""),
            })
        return {"success": True, "orders": orders}
    except Exception as e:
        raise HTTPException(500, f"체결내역 조회 실패: {str(e)}")


@router.get("/buyable")
async def get_buyable(stock_code: str, price: int):
    """매수 가능 금액/수량 조회"""
    client = _require_configured()
    try:
        result = await client.get_buyable_amount(stock_code, price)
        output = result.get("output", {})
        return {
            "success": True,
            "max_qty": int(output.get("nrcvb_buy_qty", "0")),
            "max_amount": int(output.get("nrcvb_buy_amt", "0")),
            "deposit": int(output.get("dnca_tot_amt", "0")),
        }
    except Exception as e:
        raise HTTPException(500, f"매수가능 조회 실패: {str(e)}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2단계: 시세 데이터
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/quote/{stock_code}")
async def get_quote(stock_code: str):
    """현재가 조회"""
    client = _require_configured()
    try:
        result = await client.get_current_price(stock_code)
        output = result.get("output", {})
        return {
            "success": True,
            "stock_code": stock_code,
            "name": output.get("rprs_mrkt_kor_name", output.get("hts_kor_isnm", "")),
            "price": int(output.get("stck_prpr", "0")),
            "change": int(output.get("prdy_vrss", "0")),
            "change_rate": float(output.get("prdy_ctrt", "0")),
            "change_sign": output.get("prdy_vrss_sign", ""),
            "volume": int(output.get("acml_vol", "0")),
            "trade_amount": int(output.get("acml_tr_pbmn", "0")),
            "high": int(output.get("stck_hgpr", "0")),
            "low": int(output.get("stck_lwpr", "0")),
            "open": int(output.get("stck_oprc", "0")),
            "prev_close": int(output.get("stck_sdpr", "0")),
            "per": float(output.get("per", "0") or "0"),
            "pbr": float(output.get("pbr", "0") or "0"),
            "eps": float(output.get("eps", "0") or "0"),
            "market_cap": int(output.get("hts_avls", "0")),
            "52w_high": int(output.get("stck_dryc_hgpr", "0") or "0"),
            "52w_low": int(output.get("stck_dryc_lwpr", "0") or "0"),
        }
    except Exception as e:
        raise HTTPException(500, f"시세 조회 실패: {str(e)}")


@router.get("/chart/{stock_code}")
async def get_chart(
    stock_code: str,
    period: str = Query("D", description="D=일, W=주, M=월, Y=년"),
    start_date: str = Query("", description="시작일 YYYYMMDD"),
    end_date: str = Query("", description="종료일 YYYYMMDD"),
):
    """일/주/월 차트 데이터"""
    client = _require_configured()
    try:
        result = await client.get_daily_chart(stock_code, period, start_date, end_date)
        candles = []
        for c in result.get("output2", []):
            if c.get("stck_bsop_date"):
                candles.append({
                    "date": c.get("stck_bsop_date", ""),
                    "open": int(c.get("stck_oprc", "0")),
                    "high": int(c.get("stck_hgpr", "0")),
                    "low": int(c.get("stck_lwpr", "0")),
                    "close": int(c.get("stck_clpr", "0")),
                    "volume": int(c.get("acml_vol", "0")),
                    "amount": int(c.get("acml_tr_pbmn", "0")),
                })
        return {"success": True, "candles": candles, "info": result.get("output1", {})}
    except Exception as e:
        raise HTTPException(500, f"차트 조회 실패: {str(e)}")


@router.get("/asking/{stock_code}")
async def get_asking(stock_code: str):
    """호가 조회"""
    client = _require_configured()
    try:
        result = await client.get_asking_price(stock_code)
        output = result.get("output1", {})
        asks = []
        bids = []
        for i in range(1, 11):
            asks.append({
                "price": int(output.get(f"askp{i}", "0")),
                "qty": int(output.get(f"askp_rsqn{i}", "0")),
            })
            bids.append({
                "price": int(output.get(f"bidp{i}", "0")),
                "qty": int(output.get(f"bidp_rsqn{i}", "0")),
            })
        return {
            "success": True,
            "asks": asks,
            "bids": bids,
            "total_ask_qty": int(output.get("total_askp_rsqn", "0")),
            "total_bid_qty": int(output.get("total_bidp_rsqn", "0")),
        }
    except Exception as e:
        raise HTTPException(500, f"호가 조회 실패: {str(e)}")


@router.get("/investor/{stock_code}")
async def get_investor(stock_code: str):
    """투자자별 매매동향"""
    client = _require_configured()
    try:
        result = await client.get_investor(stock_code)
        return {"success": True, "data": result.get("output", [])}
    except Exception as e:
        raise HTTPException(500, f"투자자 동향 조회 실패: {str(e)}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3단계: 시장 분석
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/ranking/volume")
async def volume_ranking(market: str = Query("J", description="J=전체, 0=코스피, 1=코스닥")):
    """거래량 순위 TOP 30"""
    client = _require_configured()
    try:
        result = await client.get_volume_rank(market)
        items = []
        for item in result.get("output", [])[:30]:
            items.append({
                "rank": int(item.get("data_rank", "0")),
                "stock_code": item.get("mksc_shrn_iscd", ""),
                "stock_name": item.get("hts_kor_isnm", ""),
                "price": int(item.get("stck_prpr", "0")),
                "change": int(item.get("prdy_vrss", "0")),
                "change_rate": float(item.get("prdy_ctrt", "0")),
                "volume": int(item.get("acml_vol", "0")),
                "trade_amount": int(item.get("acml_tr_pbmn", "0")),
                "change_sign": item.get("prdy_vrss_sign", ""),
            })
        return {"success": True, "items": items}
    except Exception as e:
        raise HTTPException(500, f"거래량 순위 조회 실패: {str(e)}")


@router.get("/ranking/fluctuation")
async def fluctuation_ranking(
    market: str = Query("J"),
    sort: str = Query("0", description="0=상승, 1=하락"),
):
    """등락률 순위"""
    client = _require_configured()
    try:
        result = await client.get_fluctuation_rank(market, sort)
        items = []
        for item in result.get("output", [])[:30]:
            items.append({
                "rank": int(item.get("data_rank", "0")),
                "stock_code": item.get("mksc_shrn_iscd", item.get("stck_shrn_iscd", "")),
                "stock_name": item.get("hts_kor_isnm", ""),
                "price": int(item.get("stck_prpr", "0")),
                "change": int(item.get("prdy_vrss", "0")),
                "change_rate": float(item.get("prdy_ctrt", "0")),
                "volume": int(item.get("acml_vol", "0")),
                "change_sign": item.get("prdy_vrss_sign", ""),
            })
        return {"success": True, "items": items}
    except Exception as e:
        raise HTTPException(500, f"등락률 순위 조회 실패: {str(e)}")


@router.get("/index")
async def market_index():
    """코스피/코스닥 지수"""
    client = _require_configured()
    try:
        kospi = await client.get_market_index("0001")
        kosdaq = await client.get_market_index("1001")

        def parse_index(data):
            o = data.get("output", {})
            return {
                "price": float(o.get("bstp_nmix_prpr", "0")),
                "change": float(o.get("bstp_nmix_prdy_vrss", "0")),
                "change_rate": float(o.get("bstp_nmix_prdy_ctrt", "0")),
                "volume": int(o.get("acml_vol", "0")),
                "trade_amount": int(o.get("acml_tr_pbmn", "0")),
            }

        return {
            "success": True,
            "kospi": parse_index(kospi),
            "kosdaq": parse_index(kosdaq),
        }
    except Exception as e:
        raise HTTPException(500, f"지수 조회 실패: {str(e)}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 재무제표
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/finance/{stock_code}")
async def get_finance(stock_code: str):
    """종합 재무정보"""
    client = _require_configured()
    try:
        ratio = await client.get_financial_ratio(stock_code)
        income = await client.get_income_statement(stock_code)
        growth = await client.get_growth_ratio(stock_code)

        return {
            "success": True,
            "financial_ratio": ratio.get("output", []),
            "income_statement": income.get("output", []),
            "growth_ratio": growth.get("output", []),
        }
    except Exception as e:
        raise HTTPException(500, f"재무정보 조회 실패: {str(e)}")


@router.get("/finance/{stock_code}/ratio")
async def get_finance_ratio(stock_code: str):
    """재무비율 (PER/PBR/ROE)"""
    client = _require_configured()
    try:
        result = await client.get_financial_ratio(stock_code)
        return {"success": True, "data": result.get("output", [])}
    except Exception as e:
        raise HTTPException(500, f"재무비율 조회 실패: {str(e)}")


@router.get("/finance/{stock_code}/balance-sheet")
async def get_finance_bs(stock_code: str):
    """대차대조표"""
    client = _require_configured()
    try:
        result = await client.get_balance_sheet(stock_code)
        return {"success": True, "data": result.get("output", [])}
    except Exception as e:
        raise HTTPException(500, f"대차대조표 조회 실패: {str(e)}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 전략 자동매매 관리
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class StrategyRegisterRequest(BaseModel):
    stock_code: str
    stock_name: str = ""
    buy_price: float
    buy_date: str = ""
    qty: int
    strategy: str = "smart"
    account_type: str = "virtual"
    custom_params: Optional[dict] = None


class StrategyUpdateRequest(BaseModel):
    strategy: Optional[str] = None
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    max_hold_days: Optional[int] = None
    trailing_stop_pct: Optional[float] = None
    profit_activation_pct: Optional[float] = None
    grace_days: Optional[int] = None


def _get_supabase():
    """Supabase 클라이언트 가져오기"""
    try:
        from app.core.config import config
        return config.supabase
    except Exception:
        return None


@router.post("/strategy/register")
async def strategy_register(req: StrategyRegisterRequest):
    """보유종목에 자동매매 전략 등록"""
    supabase = _get_supabase()
    if not supabase:
        raise HTTPException(500, "DB 연결 실패")

    buy_date = req.buy_date or datetime.now().strftime("%Y-%m-%d")
    result = await register_kis_position(
        supabase=supabase,
        stock_code=req.stock_code,
        stock_name=req.stock_name,
        buy_price=req.buy_price,
        buy_date=buy_date,
        qty=req.qty,
        strategy=req.strategy,
        account_type=req.account_type,
        custom_params=req.custom_params,
    )
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.get("/strategy/positions")
async def strategy_positions(
    account_type: str = Query("virtual", description="virtual 또는 real"),
    status: str = Query("all", description="all, holding, 또는 sold_*"),
):
    """전략 관리 포지션 목록 조회"""
    supabase = _get_supabase()
    if not supabase:
        raise HTTPException(500, "DB 연결 실패")

    result = await get_kis_managed_positions(supabase, account_type, status)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.post("/strategy/check")
async def strategy_check(
    account_type: str = Query("virtual"),
    auto_sell: bool = Query(True, description="True=매도 실행, False=신호만 반환"),
):
    """전략 체크 실행 — 매도 신호 확인 및 주문"""
    _require_configured()
    supabase = _get_supabase()
    if not supabase:
        raise HTTPException(500, "DB 연결 실패")

    result = await check_and_execute_kis_positions(supabase, account_type, auto_sell)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.delete("/strategy/positions/{position_id}")
async def strategy_remove(position_id: int):
    """전략 관리에서 포지션 제거"""
    supabase = _get_supabase()
    if not supabase:
        raise HTTPException(500, "DB 연결 실패")

    result = await remove_kis_managed_position(supabase, position_id)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.put("/strategy/positions/{position_id}")
async def strategy_update_params(position_id: int, req: StrategyUpdateRequest):
    """전략 파라미터 변경"""
    supabase = _get_supabase()
    if not supabase:
        raise HTTPException(500, "DB 연결 실패")

    params = {k: v for k, v in req.model_dump().items() if v is not None}
    result = await update_kis_strategy_params(supabase, position_id, params)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.post("/strategy/auto-invest")
async def strategy_auto_invest(
    account_type: str = Query("virtual", description="virtual 또는 real"),
):
    """예비후보 종목에서 종합 판단 후 자동 매수 (예수금 전액)"""
    _require_configured()
    supabase = _get_supabase()
    if not supabase:
        raise HTTPException(500, "DB 연결 실패")

    result = await auto_invest_from_candidates(supabase, account_type)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.get("/server-logs")
async def get_server_logs(
    account_type: str = Query("all", description="all / virtual / real"),
    limit: int = Query(50, ge=1, le=200),
):
    """서버 자동매매 실행 로그 조회"""
    supabase = _get_supabase()
    if not supabase:
        raise HTTPException(500, "DB 연결 실패")

    try:
        query = supabase.table("server_auto_trade_logs").select("*")
        if account_type != "all":
            query = query.eq("account_type", account_type)
        result = query.order("created_at", desc=True).limit(limit).execute()
        return {"logs": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        # 테이블이 아직 생성되지 않은 경우 빈 결과 반환
        error_str = str(e)
        if "server_auto_trade_logs" in error_str and ("does not exist" in error_str or "42P01" in error_str):
            return {"logs": [], "count": 0, "notice": "server_auto_trade_logs 테이블이 아직 생성되지 않았습니다. Supabase SQL Editor에서 migrations/002_server_auto_trade_logs.sql을 실행해주세요."}
        raise HTTPException(500, f"서버 로그 조회 실패: {e}")
