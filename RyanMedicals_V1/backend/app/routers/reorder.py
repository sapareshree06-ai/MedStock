"""
Reorder recommendation API endpoints.

GET /api/reorder/recommendations  — full recommendations for all medicines
GET /api/reorder/summary          — dashboard-level counts by urgency
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.reorder import (
    get_all_recommendations,
    DEFAULT_WINDOW_DAYS,
    DEFAULT_TARGET_DAYS,
    DEFAULT_SAFETY_DAYS,
)

router = APIRouter(prefix="/api/reorder", tags=["Reorder"])


@router.get("/recommendations")
def recommendations(
    window_days: int = Query(DEFAULT_WINDOW_DAYS, ge=7, le=180, description="Sales lookback window in days"),
    target_days: int = Query(DEFAULT_TARGET_DAYS, ge=7, le=180, description="Target stock coverage in days"),
    safety_days: int = Query(DEFAULT_SAFETY_DAYS, ge=0, le=30, description="Safety buffer in days"),
    db: Session = Depends(get_db),
):
    return get_all_recommendations(
        db,
        window_days=window_days,
        target_days=target_days,
        safety_days=safety_days,
    )


@router.get("/summary")
def reorder_summary(
    window_days: int = Query(DEFAULT_WINDOW_DAYS, ge=7, le=180),
    target_days: int = Query(DEFAULT_TARGET_DAYS, ge=7, le=180),
    safety_days: int = Query(DEFAULT_SAFETY_DAYS, ge=0, le=30),
    db: Session = Depends(get_db),
):
    recs = get_all_recommendations(
        db,
        window_days=window_days,
        target_days=target_days,
        safety_days=safety_days,
    )

    counts = {"CRITICAL": 0, "REORDER_NOW": 0, "ADEQUATE": 0, "OVERSTOCKED": 0, "NO_SALES": 0}
    total_cost = 0.0

    for r in recs:
        counts[r["urgency"]] = counts.get(r["urgency"], 0) + 1
        total_cost += r["estimated_cost"]

    return {
        "total_medicines": len(recs),
        "critical": counts["CRITICAL"],
        "reorder_now": counts["REORDER_NOW"],
        "adequate": counts["ADEQUATE"],
        "overstocked": counts["OVERSTOCKED"],
        "no_sales": counts["NO_SALES"],
        "needs_action": counts["CRITICAL"] + counts["REORDER_NOW"],
        "total_estimated_cost": round(total_cost, 2),
    }
