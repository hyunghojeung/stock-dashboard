"""FastAPI 메인 앱"""
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
from app.core.config import config, KST
from app.core.scheduler import setup_scheduler
from app.api import stock_routes, trade_routes, portfolio_routes, watchlist_routes, strategy_routes, kakao_routes
from app.utils.kr_holiday import get_market_status, is_market_open_now, get_holiday_name, get_next_market_day
from datetime import datetime
from app.api.backtest_routes import router as backtest_router
from app.api.swing_routes import router as swing_router
from app.api.pattern_routes import router as pattern_router
from app.api.surge_scanner_routes import router as scanner_router
from app.api.virtual_invest_routes import router as virtual_invest_router
from app.api.buy_candidates_routes import router as candidates_router

# ★ KIS 모의투자 API
from kis_routes import router as kis_router

# ★ 패턴 벡터 수집기
from app.services.stock_pattern_collector import run_pattern_collection

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_scheduler()

    # ★ 전종목 패턴 벡터 수집 스케줄러 등록 (매일 18:30 KST)
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
        import pytz

        pattern_scheduler = BackgroundScheduler(timezone=pytz.timezone("Asia/Seoul"))
        pattern_scheduler.add_job(
            run_pattern_collection,
            CronTrigger(hour=18, minute=30, timezone=pytz.timezone("Asia/Seoul")),
            id="pattern_vector_collection",
            name="전종목 패턴 벡터 수집",
            replace_existing=True,
        )
        pattern_scheduler.start()
        print("[스케줄러] 전종목 패턴 벡터 수집 등록 (매일 18:30 KST)")
    except Exception as e:
        print(f"[스케줄러] 패턴 수집 스케줄러 등록 실패 (무시): {e}")

    # ★ 통합 전략 자동 체크 스케줄러 (장중 10분 간격)
    strategy_scheduler = None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler as BgScheduler
        from apscheduler.triggers.cron import CronTrigger as Cron
        import asyncio as _asyncio

        async def _scheduled_strategy_check():
            """장중 자동 전략 체크 — 가상투자 + KIS 관리 포지션"""
            now = datetime.now(KST)
            if not is_market_open_now(now):
                return

            try:
                supabase = config.supabase
                if not supabase:
                    return

                # 1. 가상투자 활성 세션 업데이트
                from virtual_invest import update_realtime
                sessions = supabase.table("virtual_realtime_session").select(
                    "session_id"
                ).eq("status", "active").execute()
                for s in (sessions.data or []):
                    await update_realtime(s["session_id"], supabase)

                # 2. KIS 모의투자 전략 체크
                from kis_strategy_executor import check_and_execute_kis_positions
                await check_and_execute_kis_positions(supabase, "virtual")

            except Exception as ex:
                print(f"[전략체크] 오류: {ex}")

        def _run_strategy_check():
            try:
                loop = _asyncio.new_event_loop()
                loop.run_until_complete(_scheduled_strategy_check())
                loop.close()
            except Exception as ex:
                print(f"[전략체크] 실행 오류: {ex}")

        strategy_scheduler = BgScheduler(timezone=pytz.timezone("Asia/Seoul"))
        strategy_scheduler.add_job(
            _run_strategy_check,
            Cron(
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
        print(f"[스케줄러] 전략 자동 체크 등록 실패 (무시): {e}")

    print("[서버] 10억 만들기 자동매매 서버 시작")
    yield

    if strategy_scheduler:
        strategy_scheduler.shutdown(wait=False)
    print("[서버] 서버 종료")

app = FastAPI(title="10억 만들기 - 주식 자동매매", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(stock_routes.router)
app.include_router(trade_routes.router)
app.include_router(portfolio_routes.router)
app.include_router(watchlist_routes.router)
app.include_router(strategy_routes.router)
app.include_router(kakao_routes.router)
app.include_router(backtest_router)
app.include_router(swing_router)
app.include_router(scanner_router)
app.include_router(pattern_router)
app.include_router(virtual_invest_router)
app.include_router(kis_router)
app.include_router(candidates_router)

@app.get("/api/health")
async def health():
    now = datetime.now(KST)
    return {"name": "10억 만들기", "status": "running", "market": get_market_status(now)}

@app.get("/api/auth")
async def authenticate(password: str = ""):
    return {"authenticated": True}

@app.get("/api/system/status")
async def system_status():
    now = datetime.now(KST)
    holiday = get_holiday_name(now.date())
    return {
        "datetime": now.isoformat(),
        "date_kr": now.strftime("%Y년 %m월 %d일 (%a)"),
        "time_kr": now.strftime("%H:%M:%S"),
        "market_status": get_market_status(now),
        "is_market_open": is_market_open_now(now),
        "holiday": holiday,
        "next_market_day": str(get_next_market_day(now.date())) if not is_market_open_now(now) else None,
    }

@app.get("/api/scan/trigger")
async def trigger_scan(password: str = ""):
    """수동 전종목 스캔 트리거"""
    if password != config.SITE_PASSWORD:
        raise HTTPException(403, "비밀번호가 틀렸습니다")
    try:
        from app.engine.scanner import scan_all_stocks
        from app.engine.scorer import score_and_select
        stocks = await scan_all_stocks()
        candidates = await score_and_select(stocks, top_n=30)
        return {"success": True, "message": f"스캔 완료: 후보 {len(candidates)}개", "count": len(candidates)}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/trading/trigger")
async def trigger_trading(password: str = ""):
    if password != config.SITE_PASSWORD:
        raise HTTPException(403, "비밀번호가 틀렸습니다")
    from app.engine.trade_executor import execute_trading_cycle
    await execute_trading_cycle()
    return {"success": True, "message": "매매사이클 수동 실행 완료"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ★ 전종목 패턴 벡터 수집 엔드포인트
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_pattern_collect_state = {"running": False, "result": None, "started_at": None}

@app.post("/api/patterns/collect")
async def collect_patterns(background_tasks: BackgroundTasks):
    """전종목 패턴 벡터 수동 수집 (백그라운드 실행, 약 8~10분 소요)"""
    if _pattern_collect_state["running"]:
        return {
            "status": "already_running",
            "message": "이미 수집 중입니다",
            "started_at": _pattern_collect_state["started_at"],
        }

    def _run():
        _pattern_collect_state["running"] = True
        _pattern_collect_state["started_at"] = datetime.now(KST).isoformat()
        _pattern_collect_state["result"] = None
        try:
            result = run_pattern_collection()
            _pattern_collect_state["result"] = result
        except Exception as e:
            _pattern_collect_state["result"] = {"error": str(e)}
        finally:
            _pattern_collect_state["running"] = False

    background_tasks.add_task(_run)
    return {
        "status": "started",
        "message": "전종목 패턴 벡터 수집 시작 (약 8~10분 소요)",
    }

@app.get("/api/patterns/collect/status")
async def collect_patterns_status():
    """패턴 벡터 수집 상태 확인"""
    return {
        "running": _pattern_collect_state["running"],
        "started_at": _pattern_collect_state["started_at"],
        "result": _pattern_collect_state["result"],
    }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ★ 스캔 히스토리 저장/조회 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
from pydantic import BaseModel
from typing import Optional, List, Any

class ScanHistorySaveRequest(BaseModel):
    scan_date: str
    market: str = "ALL"
    period_days: int = 365
    rise_pct: float = 30
    rise_window: int = 5
    min_volume_ratio: float = 2.0
    total_scanned: int = 0
    total_found: int = 0
    total_surges: int = 0
    high_manip_count: int = 0
    medium_manip_count: int = 0
    entry_signal_count: int = 0
    stocks: List[Any] = []

@app.post("/api/scan-history/save")
async def save_scan_history(req: ScanHistorySaveRequest):
    """스캔 결과를 scan_history 테이블에 저장"""
    try:
        from app.core.database import db
        save_data = {
            "scan_date": req.scan_date,
            "status": "done",
            "market": req.market,
            "period_days": req.period_days,
            "rise_pct": req.rise_pct,
            "rise_window": req.rise_window,
            "min_volume_ratio": req.min_volume_ratio,
            "total_scanned": req.total_scanned,
            "total_found": req.total_found,
            "total_surges": req.total_surges,
            "high_manip_count": req.high_manip_count,
            "medium_manip_count": req.medium_manip_count,
            "entry_signal_count": req.entry_signal_count,
            "stocks": req.stocks,
        }
        result = db.table("scan_history").insert(save_data).execute()
        return {"success": True, "id": result.data[0]["id"] if result.data else None}
    except Exception as e:
        print(f"[scan-history] 저장 실패: {e}")
        raise HTTPException(500, f"저장 실패: {str(e)}")

@app.get("/api/scan-history/list")
async def list_scan_history(limit: int = 20):
    """스캔 히스토리 목록 조회 (최근 N개, stocks 제외)"""
    try:
        from app.core.database import db
        resp = (
            db.table("scan_history")
            .select("id, scan_date, status, market, period_days, rise_pct, rise_window, min_volume_ratio, total_scanned, total_found, total_surges, high_manip_count, medium_manip_count, entry_signal_count, created_at")
            .order("scan_date", desc=True)
            .limit(limit)
            .execute()
        )
        return {"items": resp.data}
    except Exception as e:
        print(f"[scan-history] 목록 조회 실패: {e}")
        raise HTTPException(500, f"조회 실패: {str(e)}")

@app.get("/api/scan-history/{history_id}")
async def get_scan_history_detail(history_id: int):
    """특정 스캔 히스토리 상세 조회 (stocks 포함)"""
    try:
        from app.core.database import db
        resp = (
            db.table("scan_history")
            .select("*")
            .eq("id", history_id)
            .single()
            .execute()
        )
        if not resp.data:
            raise HTTPException(404, "스캔 히스토리를 찾을 수 없습니다")
        row = resp.data
        return {
            "status": "done",
            "scan_date": row["scan_date"],
            "market": row["market"],
            "source": "db",
            "stats": {
                "total_scanned": row["total_scanned"],
                "total_found": row["total_found"],
                "total_surges": row["total_surges"],
                "high_manip_count": row["high_manip_count"],
                "medium_manip_count": row["medium_manip_count"],
                "entry_signal_count": row["entry_signal_count"],
            },
            "stocks": row.get("stocks", []),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[scan-history] 상세 조회 실패: {e}")
        raise HTTPException(500, f"조회 실패: {str(e)}")

class ScanHistoryDeleteRequest(BaseModel):
    ids: List[int]

@app.post("/api/scan-history/delete")
async def delete_scan_history(req: ScanHistoryDeleteRequest):
    """스캔 히스토리 다중 삭제"""
    try:
        from app.core.database import db
        for hid in req.ids:
            db.table("scan_history").delete().eq("id", hid).execute()
        return {"success": True, "deleted": len(req.ids)}
    except Exception as e:
        print(f"[scan-history] 삭제 실패: {e}")
        raise HTTPException(500, f"삭제 실패: {str(e)}")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ★ 프론트엔드 정적 파일 서빙 (SPA)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")
if not os.path.isdir(DIST_DIR):
    DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")

if os.path.isdir(DIST_DIR):
    # /assets 등 정적 파일 서빙
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """SPA 라우팅: API가 아닌 모든 경로는 index.html 반환"""
        # 정적 파일 존재하면 직접 서빙
        file_path = os.path.join(DIST_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        # 그 외 모든 경로 → index.html (React Router)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
else:
    @app.get("/")
    async def root():
        now = datetime.now(KST)
        return {"name": "10억 만들기", "status": "running", "market": get_market_status(now), "note": "프론트엔드 빌드 파일(dist/)이 없습니다. npm run build 를 실행하세요."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
