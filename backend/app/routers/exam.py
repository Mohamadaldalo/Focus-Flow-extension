"""
backend/app/routers/exam.py  ← REPLACE your existing exam.py
Full file with uninstall ping endpoint added.
"""
import json, secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db
from ..deps import get_current_user
from ..security import verify_password

router = APIRouter(prefix="/exam", tags=["exam"])

class ExamStart(BaseModel):
    password: str
    duration_minutes: int
    allowed_domains: list[str]

class ExamEnd(BaseModel):
    supervisor_code: str

class ViolationReport(BaseModel):
    client_id: str
    violation_type: str
    domain: str | None = None

class ExamActiveResponse(BaseModel):
    active: bool
    exam_id: str | None = None
    duration_minutes: int | None = None
    start_time: str | None = None
    allowed_domains: list[str] = []
    remaining_seconds: int | None = None

class ViolationOut(BaseModel):
    id: str
    client_id: str
    violation_type: str
    domain: str | None
    timestamp: str

class ExamStatsResponse(BaseModel):
    exam_id: str
    duration_minutes: int
    start_time: str
    remaining_seconds: int
    allowed_domains: list[str]
    total_violations: int
    tab_switches: int
    blocked_attempts: int
    extension_removals: int
    violations: list[ViolationOut]
    supervisor_code: str

def _get_active_exam(db: Session) -> models.ExamSession | None:
    exam = (
        db.query(models.ExamSession)
        .filter(models.ExamSession.status == models.ExamStatus.active)
        .order_by(models.ExamSession.start_time.desc())
        .first()
    )
    if exam is None:
        return None
    elapsed = (datetime.utcnow() - exam.start_time).total_seconds() / 60
    if elapsed >= exam.duration_minutes:
        exam.status = models.ExamStatus.ended
        exam.end_time = datetime.utcnow()
        db.commit()
        return None
    return exam

def _remaining(exam: models.ExamSession) -> int:
    elapsed = (datetime.utcnow() - exam.start_time).total_seconds()
    return max(0, int(exam.duration_minutes * 60 - elapsed))

@router.post("/start", status_code=status.HTTP_201_CREATED)
def start_exam(payload: ExamStart, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    if _get_active_exam(db):
        raise HTTPException(status.HTTP_409_CONFLICT, "An exam is already active")
    code = "NEU-" + secrets.token_hex(2).upper()
    domains = [
        d.strip().lower().removeprefix("https://").removeprefix("http://").removeprefix("www.").split("/")[0]
        for d in payload.allowed_domains if d.strip()
    ]
    exam = models.ExamSession(
        supervisor_code=code,
        duration_minutes=payload.duration_minutes,
        allowed_domains_json=json.dumps(domains),
        created_by_user_id=current_user.id,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return {"exam_id": exam.id, "supervisor_code": code, "duration_minutes": exam.duration_minutes, "allowed_domains": domains}

@router.get("/active", response_model=ExamActiveResponse)
def get_active_exam(db: Session = Depends(get_db)):
    exam = _get_active_exam(db)
    if not exam:
        return ExamActiveResponse(active=False)
    return ExamActiveResponse(
        active=True, exam_id=exam.id, duration_minutes=exam.duration_minutes,
        start_time=exam.start_time.isoformat(), allowed_domains=json.loads(exam.allowed_domains_json),
        remaining_seconds=_remaining(exam),
    )

@router.post("/violation", status_code=status.HTTP_204_NO_CONTENT)
def report_violation(payload: ViolationReport, db: Session = Depends(get_db)):
    exam = _get_active_exam(db)
    if not exam:
        return
    type_map = {
        "tab_switch":        models.ViolationType.tab_switch,
        "blocked_site":      models.ViolationType.blocked_site,
        "extension_removed": models.ViolationType.extension_removed,
    }
    v_type = type_map.get(payload.violation_type, models.ViolationType.blocked_site)
    db.add(models.ExamViolation(exam_id=exam.id, client_id=payload.client_id, violation_type=v_type, domain=payload.domain))
    db.commit()

@router.get("/uninstall-ping")
def uninstall_ping(client_id: str, exam_id: str, db: Session = Depends(get_db)):
    """
    Chrome opens this URL automatically when the extension is uninstalled.
    Must be GET — Chrome navigates to setUninstallURL as a browser page request.
    """
    exam = db.get(models.ExamSession, exam_id)
    if not exam or exam.status != models.ExamStatus.active:
        return {"logged": False}
    db.add(models.ExamViolation(
        exam_id=exam_id,
        client_id=client_id,
        violation_type=models.ViolationType.extension_removed,
        domain=None,
    ))
    db.commit()
    return {"logged": True}

@router.get("/stats", response_model=ExamStatsResponse)
def exam_stats(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    exam = _get_active_exam(db)
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active exam")
    violations = (
        db.query(models.ExamViolation)
        .filter(models.ExamViolation.exam_id == exam.id)
        .order_by(models.ExamViolation.timestamp.desc())
        .all()
    )
    return ExamStatsResponse(
        exam_id=exam.id, duration_minutes=exam.duration_minutes,
        start_time=exam.start_time.isoformat(), remaining_seconds=_remaining(exam),
        allowed_domains=json.loads(exam.allowed_domains_json),
        total_violations=len(violations),
        tab_switches=sum(1 for v in violations if v.violation_type == models.ViolationType.tab_switch),
        blocked_attempts=sum(1 for v in violations if v.violation_type == models.ViolationType.blocked_site),
        extension_removals=sum(1 for v in violations if v.violation_type == models.ViolationType.extension_removed),
        violations=[
            ViolationOut(
                id=v.id,
                client_id=v.client_id[:8] + "…",
                violation_type=v.violation_type.value,
                domain=v.domain,
                timestamp=v.timestamp.isoformat(),
            )
            for v in violations
        ],
        supervisor_code=exam.supervisor_code,
    )

@router.post("/end", status_code=status.HTTP_204_NO_CONTENT)
def end_exam(payload: ExamEnd, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    exam = _get_active_exam(db)
    if not exam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active exam")
    if payload.supervisor_code.strip().upper() != exam.supervisor_code.upper():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect supervisor code")
    exam.status = models.ExamStatus.ended
    exam.end_time = datetime.utcnow()
    db.commit()