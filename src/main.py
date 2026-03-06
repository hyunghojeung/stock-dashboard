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

    print("[서버] 10억 만들기 자동매매 서버 시작")
    yield
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
