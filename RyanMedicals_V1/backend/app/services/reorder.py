"""
Intelligent Reorder Recommendations — MedStock IQ

Analyses sales velocity, usable inventory, supplier lead times,
projected stockout dates, and recommended reorder quantities for
every medicine in the system.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from dataclasses import dataclass, asdict
from enum import Enum

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..models import Medicine, Batch, StockMovement, Supplier


# ── Urgency tiers ───────────────────────────────────────────────────

class Urgency(str, Enum):
    CRITICAL = "CRITICAL"       # Will stockout before an order can arrive
    REORDER_NOW = "REORDER_NOW" # Within lead-time + safety buffer
    ADEQUATE = "ADEQUATE"       # Enough runway
    OVERSTOCKED = "OVERSTOCKED" # Unusually high stock relative to sales
    NO_SALES = "NO_SALES"       # No recorded sales — cannot forecast


# ── Result container ────────────────────────────────────────────────

@dataclass
class ReorderRecommendation:
    medicine_id: int
    medicine_name: str
    category: str | None

    # Supplier info
    supplier_id: int | None
    supplier_name: str | None
    lead_time_days: int

    # Velocity
    avg_daily_sales: float
    total_sold: int
    window_days: int

    # Inventory
    usable_stock: int
    expiring_soon_qty: int          # units expiring within lead_time + safety

    # Projections
    days_of_stock_remaining: float | None
    stockout_date: str | None       # ISO date string

    # Recommendation
    reorder_point: int
    safety_stock: int
    recommended_qty: int
    estimated_cost: float
    latest_unit_price: float

    # Urgency
    urgency: str


# ── Default configuration ───────────────────────────────────────────

DEFAULT_WINDOW_DAYS = 30
DEFAULT_TARGET_DAYS = 30
DEFAULT_SAFETY_DAYS = 5
DEFAULT_LEAD_TIME_DAYS = 3


# ── Core calculations ──────────────────────────────────────────────

def _sales_velocity(
    medicine_id: int,
    window_days: int,
    db: Session,
) -> tuple[float, int]:
    """Return (average daily sales, total units sold) over the lookback window."""
    cutoff = date.today() - timedelta(days=window_days)

    total_sold: int = db.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity), 0))
        .join(Batch, StockMovement.batch_id == Batch.id)
        .where(
            Batch.medicine_id == medicine_id,
            StockMovement.movement_type == "OUT",
            StockMovement.timestamp >= cutoff.isoformat(),
        )
    ) or 0

    avg = total_sold / max(window_days, 1)
    return round(avg, 4), int(total_sold)


def _usable_stock(medicine: Medicine) -> int:
    """Sum of non-expired batch quantities."""
    today = date.today()
    return sum(
        b.quantity
        for b in medicine.batches
        if b.quantity > 0 and b.expiry_date >= today
    )


def _expiring_soon(medicine: Medicine, horizon_days: int) -> int:
    """Units expiring within *horizon_days* (still usable today, but short shelf life)."""
    today = date.today()
    cutoff = today + timedelta(days=horizon_days)
    return sum(
        b.quantity
        for b in medicine.batches
        if b.quantity > 0 and today <= b.expiry_date <= cutoff
    )


def _latest_unit_price(medicine: Medicine) -> float:
    """Purchase price from the most recently created batch (fallback 0)."""
    if not medicine.batches:
        return 0.0
    latest = max(medicine.batches, key=lambda b: b.id)
    return latest.purchase_price


def _primary_supplier(medicine: Medicine, db: Session) -> Supplier | None:
    """Return the supplier of the most recent batch for this medicine."""
    latest_batch = db.scalar(
        select(Batch)
        .where(Batch.medicine_id == medicine.id, Batch.supplier_id.is_not(None))
        .order_by(Batch.id.desc())
        .limit(1)
    )
    if latest_batch and latest_batch.supplier_id:
        return db.get(Supplier, latest_batch.supplier_id)
    return None


# ── Main recommendation builder ────────────────────────────────────

def build_recommendation(
    medicine: Medicine,
    db: Session,
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    target_days: int = DEFAULT_TARGET_DAYS,
    safety_days: int = DEFAULT_SAFETY_DAYS,
) -> ReorderRecommendation:

    # 1 — Sales velocity
    avg_daily, total_sold = _sales_velocity(medicine.id, window_days, db)

    # 2 — Usable inventory
    usable = _usable_stock(medicine)

    # 3 — Supplier lead time
    supplier = _primary_supplier(medicine, db)
    lead_time = supplier.lead_time_days if supplier else DEFAULT_LEAD_TIME_DAYS

    # 4 — Expiring-soon inventory (within lead_time + safety)
    expiry_horizon = lead_time + safety_days
    expiring_soon = _expiring_soon(medicine, expiry_horizon)

    # 5 — Stockout projection
    if avg_daily > 0:
        days_remaining = round(usable / avg_daily, 1)
        stockout_date = (date.today() + timedelta(days=days_remaining)).isoformat()
    else:
        days_remaining = None
        stockout_date = None

    # 6 — Reorder point and recommended quantity
    safety_stock = math.ceil(avg_daily * safety_days)
    reorder_point = math.ceil(avg_daily * lead_time) + safety_stock
    target_stock = math.ceil(avg_daily * target_days) + safety_stock
    recommended_qty = max(0, target_stock - usable)

    # 7 — Estimated order cost
    unit_price = _latest_unit_price(medicine)
    estimated_cost = round(recommended_qty * unit_price, 2)

    # 8 — Urgency classification
    if avg_daily == 0:
        if usable == 0:
            urgency = Urgency.CRITICAL
        else:
            urgency = Urgency.NO_SALES
    elif days_remaining is not None:
        if days_remaining < lead_time:
            urgency = Urgency.CRITICAL
        elif days_remaining <= lead_time + safety_days:
            urgency = Urgency.REORDER_NOW
        elif days_remaining > target_days + safety_days + lead_time:
            urgency = Urgency.OVERSTOCKED
        else:
            urgency = Urgency.ADEQUATE
    else:
        urgency = Urgency.ADEQUATE

    return ReorderRecommendation(
        medicine_id=medicine.id,
        medicine_name=medicine.name,
        category=medicine.category,
        supplier_id=supplier.id if supplier else None,
        supplier_name=supplier.name if supplier else None,
        lead_time_days=lead_time,
        avg_daily_sales=avg_daily,
        total_sold=total_sold,
        window_days=window_days,
        usable_stock=usable,
        expiring_soon_qty=expiring_soon,
        days_of_stock_remaining=days_remaining,
        stockout_date=stockout_date,
        reorder_point=reorder_point,
        safety_stock=safety_stock,
        recommended_qty=recommended_qty,
        estimated_cost=estimated_cost,
        latest_unit_price=unit_price,
        urgency=urgency.value,
    )


def get_all_recommendations(
    db: Session,
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    target_days: int = DEFAULT_TARGET_DAYS,
    safety_days: int = DEFAULT_SAFETY_DAYS,
) -> list[dict]:
    """Build recommendations for every medicine, sorted by urgency then runout."""

    medicines = db.scalars(select(Medicine).order_by(Medicine.name)).all()

    recs = [
        build_recommendation(
            m, db,
            window_days=window_days,
            target_days=target_days,
            safety_days=safety_days,
        )
        for m in medicines
    ]

    # Sort: CRITICAL first, then REORDER_NOW, ADEQUATE, NO_SALES, OVERSTOCKED.
    priority = {
        Urgency.CRITICAL.value: 0,
        Urgency.REORDER_NOW.value: 1,
        Urgency.ADEQUATE.value: 2,
        Urgency.NO_SALES.value: 3,
        Urgency.OVERSTOCKED.value: 4,
    }

    recs.sort(key=lambda r: (
        priority.get(r.urgency, 99),
        r.days_of_stock_remaining if r.days_of_stock_remaining is not None else 9999,
    ))

    return [asdict(r) for r in recs]
