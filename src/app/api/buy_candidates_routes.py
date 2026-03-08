"""
매수 후보 파이프라인 — API 라우트
Buy Candidates Pipeline — API Routes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POST /api/candidates/register          — 후보 등록 (단일/다중)
GET  /api/candidates/list              — 후보 목록 조회
POST /api/candidates/update-status     — 상태 변경 (bought/expired/skipped)
POST /api/candidates/delete            — 후보 삭제
POST /api/candidates/cleanup           — 만료 후보 정리
GET  /api/candidates/next              — 다음 매수 추천 (상위 N개)
GET  /api/candidates/settings          — 자동화 설정 조회
POST /api/candidates/settings          — 자동화 설정 저장
POST /api/candidates/auto-register     — 스캔 결과에서 자동 등록
POST /api/candidates/migrate           — DB 테이블 마이그레이션
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
import logging
import os

KST = timezone(timedelta(hours=9))
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/candidates", tags=["candidates"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 요청/응답 모델
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class CandidateItem(BaseModel):
    code: str
    name: str
    composite_score: float = 0
    manip_score: float = 0
    entry_score: float = 0
    pattern_match_pct: Optional[float] = None
    entry_grade: Optional[str] = None
    current_price: Optional[int] = None
    recommended_buy_price: Optional[int] = None
    source: str = "manual"
    scan_session_id: Optional[int] = None
    pattern_name: Optional[str] = None
    reason: Optional[str] = None
    priority: int = 0
    filters_applied: Optional[Dict[str, Any]] = None


class RegisterRequest(BaseModel):
    candidates: List[CandidateItem]
    expire_days: int = 3


class UpdateStatusRequest(BaseModel):
    ids: List[int]
    status: str  # 'bought' | 'expired' | 'skipped'


class DeleteRequest(BaseModel):
    ids: List[int]


class SettingsRequest(BaseModel):
    auto_register: bool = False
    min_composite_score: float = 60
    min_entry_score: float = 50
    required_entry_grades: List[str] = ["auto_buy"]
    max_candidates: int = 10
    expire_days: int = 3
    auto_buy_virtual: bool = False
    auto_buy_kis: bool = False
    capital_per_stock: int = 300000
    exclude_ma5_down: bool = True
    exclude_rsi_overbought: bool = True
    min_trading_value: int = 500000000


class AutoRegisterRequest(BaseModel):
    """스캔 결과에서 자동 등록할 종목 리스트"""
    stocks: List[Dict[str, Any]]
    source: str = "scan"  # 'scan' | 'pattern_match'
    scan_session_id: Optional[int] = None
    pattern_name: Optional[str] = None


def _get_db():
    """지연 로딩으로 DB 클라이언트 가져오기"""
    from app.core.database import db
    return db


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# API 엔드포인트
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/register")
async def register_candidates(req: RegisterRequest):
    """후보 등록 (단일/다중)"""
    try:
        db = _get_db()
        now = datetime.now(KST)
        expires_at = (now + timedelta(days=req.expire_days)).isoformat()

        # 현재 active 후보 목록 조회 (중복 방지)
        existing = db.table("buy_candidates").select("code").eq("status", "active").execute()
        existing_codes = {r["code"] for r in (existing.data or [])}

        inserted = []
        skipped = []
        for c in req.candidates:
            if c.code in existing_codes:
                skipped.append(c.code)
                continue

            data = {
                "code": c.code,
                "name": c.name,
                "composite_score": c.composite_score,
                "manip_score": c.manip_score,
                "entry_score": c.entry_score,
                "pattern_match_pct": c.pattern_match_pct,
                "entry_grade": c.entry_grade,
                "current_price": c.current_price,
                "recommended_buy_price": c.recommended_buy_price or c.current_price,
                "source": c.source,
                "scan_session_id": c.scan_session_id,
                "pattern_name": c.pattern_name,
                "reason": c.reason,
                "status": "active",
                "priority": c.priority,
                "expires_at": expires_at,
                "filters_applied": c.filters_applied,
            }
            result = db.table("buy_candidates").insert(data).execute()
            if result.data:
                inserted.append(result.data[0])
                existing_codes.add(c.code)

        return {
            "success": True,
            "inserted": len(inserted),
            "skipped": len(skipped),
            "skipped_codes": skipped,
            "candidates": inserted,
        }
    except Exception as e:
        logger.error(f"[candidates] 등록 실패: {e}")
        raise HTTPException(500, f"등록 실패: {str(e)}")


@router.get("/list")
async def list_candidates(
    status: str = "active",
    limit: int = 50,
    sort_by: str = "composite_score",
    sort_dir: str = "desc",
):
    """후보 목록 조회"""
    try:
        db = _get_db()
        query = db.table("buy_candidates").select("*")

        if status != "all":
            query = query.eq("status", status)

        query = query.order(sort_by, desc=(sort_dir == "desc")).limit(limit)
        resp = query.execute()

        return {
            "success": True,
            "candidates": resp.data or [],
            "total": len(resp.data or []),
        }
    except Exception as e:
        logger.error(f"[candidates] 목록 조회 실패: {e}")
        raise HTTPException(500, f"조회 실패: {str(e)}")


@router.post("/update-status")
async def update_candidate_status(req: UpdateStatusRequest):
    """후보 상태 변경"""
    try:
        db = _get_db()
        valid_statuses = {"bought", "expired", "skipped", "active"}
        if req.status not in valid_statuses:
            raise HTTPException(400, f"유효하지 않은 상태: {req.status}")

        updated = 0
        for cid in req.ids:
            db.table("buy_candidates").update({"status": req.status}).eq("id", cid).execute()
            updated += 1

        return {"success": True, "updated": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[candidates] 상태 변경 실패: {e}")
        raise HTTPException(500, f"상태 변경 실패: {str(e)}")


@router.post("/delete")
async def delete_candidates(req: DeleteRequest):
    """후보 삭제"""
    try:
        db = _get_db()
        for cid in req.ids:
            db.table("buy_candidates").delete().eq("id", cid).execute()

        return {"success": True, "deleted": len(req.ids)}
    except Exception as e:
        logger.error(f"[candidates] 삭제 실패: {e}")
        raise HTTPException(500, f"삭제 실패: {str(e)}")


@router.post("/cleanup")
async def cleanup_expired():
    """만료된 후보 정리 (status → expired)"""
    try:
        db = _get_db()
        now = datetime.now(KST).isoformat()

        # expires_at이 지난 active 후보들을 expired로 변경
        resp = (
            db.table("buy_candidates")
            .select("id")
            .eq("status", "active")
            .lt("expires_at", now)
            .execute()
        )

        expired_ids = [r["id"] for r in (resp.data or [])]
        for cid in expired_ids:
            db.table("buy_candidates").update({"status": "expired"}).eq("id", cid).execute()

        return {"success": True, "expired": len(expired_ids)}
    except Exception as e:
        logger.error(f"[candidates] 정리 실패: {e}")
        raise HTTPException(500, f"정리 실패: {str(e)}")


@router.get("/next")
async def get_next_candidates(count: int = 3, exclude_codes: str = ""):
    """다음 매수 추천 (상위 N개, 보유종목 제외)"""
    try:
        db = _get_db()
        now = datetime.now(KST).isoformat()

        # 먼저 만료 후보 정리
        expired = (
            db.table("buy_candidates")
            .select("id")
            .eq("status", "active")
            .lt("expires_at", now)
            .execute()
        )
        for r in (expired.data or []):
            db.table("buy_candidates").update({"status": "expired"}).eq("id", r["id"]).execute()

        # active 후보 중 점수순 상위 N개
        query = (
            db.table("buy_candidates")
            .select("*")
            .eq("status", "active")
            .gte("expires_at", now)
            .order("composite_score", desc=True)
            .limit(count + 10)  # 제외 종목 고려 여유분
        )
        resp = query.execute()

        candidates = resp.data or []

        # 보유종목 제외
        if exclude_codes:
            exclude_set = set(exclude_codes.split(","))
            candidates = [c for c in candidates if c["code"] not in exclude_set]

        return {
            "success": True,
            "candidates": candidates[:count],
            "total_active": len(resp.data or []),
        }
    except Exception as e:
        logger.error(f"[candidates] 추천 조회 실패: {e}")
        raise HTTPException(500, f"추천 조회 실패: {str(e)}")


@router.get("/settings")
async def get_settings():
    """자동화 설정 조회"""
    try:
        db = _get_db()
        resp = db.table("candidate_settings").select("*").eq("id", 1).execute()

        if resp.data:
            return {"success": True, "settings": resp.data[0]}
        else:
            # 기본값 반환
            return {
                "success": True,
                "settings": {
                    "auto_register": False,
                    "min_composite_score": 60,
                    "min_entry_score": 50,
                    "required_entry_grades": ["auto_buy"],
                    "max_candidates": 10,
                    "expire_days": 3,
                    "auto_buy_virtual": False,
                    "auto_buy_kis": False,
                    "capital_per_stock": 300000,
                    "exclude_ma5_down": True,
                    "exclude_rsi_overbought": True,
                    "min_trading_value": 500000000,
                },
            }
    except Exception as e:
        logger.error(f"[candidates] 설정 조회 실패: {e}")
        raise HTTPException(500, f"설정 조회 실패: {str(e)}")


@router.post("/settings")
async def save_settings(req: SettingsRequest):
    """자동화 설정 저장"""
    try:
        db = _get_db()
        data = {
            "auto_register": req.auto_register,
            "min_composite_score": req.min_composite_score,
            "min_entry_score": req.min_entry_score,
            "required_entry_grades": req.required_entry_grades,
            "max_candidates": req.max_candidates,
            "expire_days": req.expire_days,
            "auto_buy_virtual": req.auto_buy_virtual,
            "auto_buy_kis": req.auto_buy_kis,
            "capital_per_stock": req.capital_per_stock,
            "exclude_ma5_down": req.exclude_ma5_down,
            "exclude_rsi_overbought": req.exclude_rsi_overbought,
            "min_trading_value": req.min_trading_value,
            "updated_at": datetime.now(KST).isoformat(),
        }

        # upsert: id=1 레코드 업데이트 또는 생성
        db.table("candidate_settings").upsert({"id": 1, **data}).execute()

        return {"success": True, "settings": data}
    except Exception as e:
        logger.error(f"[candidates] 설정 저장 실패: {e}")
        raise HTTPException(500, f"설정 저장 실패: {str(e)}")


@router.post("/auto-register")
async def auto_register_from_scan(req: AutoRegisterRequest):
    """스캔 결과에서 설정 기준에 맞는 종목 자동 등록"""
    try:
        db = _get_db()

        # 설정 조회
        settings_resp = db.table("candidate_settings").select("*").eq("id", 1).execute()
        settings = settings_resp.data[0] if settings_resp.data else {
            "min_composite_score": 60,
            "min_entry_score": 50,
            "required_entry_grades": ["auto_buy"],
            "max_candidates": 10,
            "expire_days": 3,
            "exclude_ma5_down": True,
            "exclude_rsi_overbought": True,
            "min_trading_value": 500000000,
        }

        # 현재 active 후보 수 확인
        active_resp = db.table("buy_candidates").select("code").eq("status", "active").execute()
        active_codes = {r["code"] for r in (active_resp.data or [])}
        active_count = len(active_codes)

        min_composite = settings.get("min_composite_score", 60)
        min_entry = settings.get("min_entry_score", 50)
        required_grades = settings.get("required_entry_grades", ["auto_buy"])
        max_candidates = settings.get("max_candidates", 10)
        expire_days = settings.get("expire_days", 3)

        now = datetime.now(KST)
        expires_at = (now + timedelta(days=expire_days)).isoformat()

        # 필터링
        filtered = []
        for stock in req.stocks:
            # 이미 등록된 종목 제외
            code = stock.get("code", "")
            if code in active_codes:
                continue

            # 종합점수 필터
            composite = stock.get("composite_score", stock.get("top_manip_score", 0))
            if composite < min_composite:
                continue

            # 진입점수 필터
            entry_score = 0
            entry_signals = stock.get("entry_signals", {})
            if isinstance(entry_signals, dict):
                entry_score = entry_signals.get("entry_score", 0)
            if entry_score < min_entry:
                continue

            # 진입등급 필터
            entry_grade = ""
            if isinstance(entry_signals, dict):
                entry_grade = entry_signals.get("entry_grade", "")
            if entry_grade and entry_grade not in required_grades:
                continue

            # MA5 하향 제외
            if settings.get("exclude_ma5_down", True):
                if stock.get("ma5_declining", False):
                    continue

            # RSI 과매수 제외
            if settings.get("exclude_rsi_overbought", True):
                if stock.get("rsi_overbought", False):
                    continue

            # 거래대금 필터
            min_trading = settings.get("min_trading_value", 500000000)
            trading_value = stock.get("trading_value", 0)
            if trading_value and trading_value < min_trading:
                continue

            # 이유 문자열 생성
            reasons = []
            if composite >= 80:
                reasons.append(f"세력점수 {composite}")
            if entry_score >= 60:
                reasons.append(f"진입점수 {entry_score}")
            if stock.get("pattern_match_pct"):
                reasons.append(f"패턴유사도 {stock['pattern_match_pct']}%")

            filtered.append({
                "code": code,
                "name": stock.get("name", ""),
                "composite_score": composite,
                "manip_score": stock.get("top_manip_score", 0),
                "entry_score": entry_score,
                "pattern_match_pct": stock.get("pattern_match_pct"),
                "entry_grade": entry_grade,
                "current_price": stock.get("current_price"),
                "recommended_buy_price": stock.get("current_price"),
                "source": req.source,
                "scan_session_id": req.scan_session_id,
                "pattern_name": req.pattern_name,
                "reason": ", ".join(reasons) if reasons else None,
                "status": "active",
                "priority": 0,
                "expires_at": expires_at,
            })

        # 정렬: 종합점수 내림차순
        filtered.sort(key=lambda x: x["composite_score"], reverse=True)

        # 최대 후보 수 제한
        remaining_slots = max(0, max_candidates - active_count)
        to_insert = filtered[:remaining_slots]

        # DB 삽입
        inserted = []
        for item in to_insert:
            result = db.table("buy_candidates").insert(item).execute()
            if result.data:
                inserted.append(result.data[0])

        return {
            "success": True,
            "total_scanned": len(req.stocks),
            "filtered": len(filtered),
            "inserted": len(inserted),
            "skipped_full": len(filtered) - len(to_insert),
            "candidates": inserted,
        }
    except Exception as e:
        logger.error(f"[candidates] 자동 등록 실패: {e}")
        raise HTTPException(500, f"자동 등록 실패: {str(e)}")


@router.post("/migrate")
async def migrate_tables():
    """DB 테이블 마이그레이션 (배포 후 1회 실행)"""
    try:
        migration_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..", "..", "migrations", "001_buy_candidates.sql"
        )

        if not os.path.exists(migration_path):
            return {"success": False, "message": "마이그레이션 파일을 찾을 수 없습니다"}

        with open(migration_path, "r") as f:
            sql = f.read()

        # psycopg2로 직접 실행 시도
        try:
            import psycopg2
            db_url = os.environ.get("DATABASE_URL")
            if not db_url:
                return {
                    "success": False,
                    "message": "DATABASE_URL 환경변수가 설정되지 않았습니다. Supabase Dashboard에서 SQL을 직접 실행해주세요.",
                    "sql": sql,
                }

            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute(sql)
            conn.commit()
            cur.close()
            conn.close()
            return {"success": True, "message": "테이블 마이그레이션 완료"}
        except ImportError:
            return {
                "success": False,
                "message": "psycopg2가 설치되지 않았습니다. Supabase Dashboard에서 SQL을 직접 실행해주세요.",
                "sql": sql,
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"직접 연결 실패: {str(e)}. Supabase Dashboard에서 SQL을 직접 실행해주세요.",
                "sql": sql,
            }
    except Exception as e:
        logger.error(f"[candidates] 마이그레이션 실패: {e}")
        raise HTTPException(500, f"마이그레이션 실패: {str(e)}")
