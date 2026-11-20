"""
Tests for the Intelligent Reorder Recommendation engine.
Run:  cd backend && python -m pytest tests/test_reorder.py -v
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Medicine, Supplier, Batch, StockMovement
from app.services.reorder import (
    build_recommendation,
    get_all_recommendations,
    _sales_velocity,
    _usable_stock,
    _expiring_soon,
)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _supplier(db, name="Test Supplier", lead_time=3):
    s = Supplier(name=name, lead_time_days=lead_time)
    db.add(s)
    db.flush()
    return s


def _medicine(db, name="Test Med", reorder_level=10):
    m = Medicine(name=name, reorder_level=reorder_level, category="Test")
    db.add(m)
    db.flush()
    return m


def _batch(db, medicine, supplier=None, qty=100, expiry_days=300, price=5.0):
    b = Batch(
        medicine_id=medicine.id,
        supplier_id=supplier.id if supplier else None,
        batch_number=f"B-{medicine.id}-{qty}",
        expiry_date=date.today() + timedelta(days=expiry_days),
        quantity=qty,
        purchase_price=price,
        mrp=price * 1.5,
    )
    db.add(b)
    db.flush()
    return b


def _out_movement(db, batch, qty, days_ago=0):
    db.add(
        StockMovement(
            batch_id=batch.id,
            movement_type="OUT",
            quantity=qty,
            timestamp=datetime.now(timezone.utc) - timedelta(days=days_ago),
            notes="test sale",
        )
    )
    db.flush()


# ── Sales velocity ──────────────────────────────────────────────────

class TestSalesVelocity:
    def test_no_movements(self, db):
        m = _medicine(db)
        _batch(db, m)
        db.commit()

        avg, total = _sales_velocity(m.id, 30, db)
        assert avg == 0.0
        assert total == 0

    def test_basic_velocity(self, db):
        m = _medicine(db)
        s = _supplier(db)
        b = _batch(db, m, s, qty=1000)

        # 10 units per day for 10 days
        for day in range(10):
            _out_movement(db, b, 10, days_ago=day + 1)
        db.commit()

        avg, total = _sales_velocity(m.id, 30, db)
        assert total == 100
        assert round(avg, 2) == round(100 / 30, 2)

    def test_ignores_stock_in(self, db):
        m = _medicine(db)
        b = _batch(db, m)
        db.add(
            StockMovement(
                batch_id=b.id,
                movement_type="IN",
                quantity=50,
                timestamp=datetime.now(timezone.utc),
                notes="restock",
            )
        )
        _out_movement(db, b, 20)
        db.commit()

        _, total = _sales_velocity(m.id, 30, db)
        assert total == 20  # IN movement not counted

    def test_respects_window(self, db):
        m = _medicine(db)
        b = _batch(db, m, qty=500)

        # Movement within window
        _out_movement(db, b, 30, days_ago=5)
        # Movement outside window
        _out_movement(db, b, 100, days_ago=40)
        db.commit()

        _, total = _sales_velocity(m.id, 30, db)
        assert total == 30  # Only the recent one


# ── Usable stock ────────────────────────────────────────────────────

class TestUsableStock:
    def test_excludes_expired(self, db):
        m = _medicine(db)
        _batch(db, m, qty=50, expiry_days=100)
        _batch(db, m, qty=30, expiry_days=-5)  # Expired
        db.commit()

        assert _usable_stock(m) == 50

    def test_excludes_zero_quantity(self, db):
        m = _medicine(db)
        _batch(db, m, qty=0, expiry_days=100)
        _batch(db, m, qty=25, expiry_days=200)
        db.commit()

        assert _usable_stock(m) == 25

    def test_sums_all_valid(self, db):
        m = _medicine(db)
        _batch(db, m, qty=40, expiry_days=50)
        _batch(db, m, qty=60, expiry_days=200)
        db.commit()

        assert _usable_stock(m) == 100


# ── Expiring soon ───────────────────────────────────────────────────

class TestExpiringSoon:
    def test_counts_within_horizon(self, db):
        m = _medicine(db)
        _batch(db, m, qty=20, expiry_days=5)   # Within 10 day horizon
        _batch(db, m, qty=80, expiry_days=100)  # Not within horizon
        db.commit()

        assert _expiring_soon(m, 10) == 20

    def test_excludes_already_expired(self, db):
        m = _medicine(db)
        _batch(db, m, qty=20, expiry_days=-1)   # Expired
        _batch(db, m, qty=10, expiry_days=3)     # Within horizon
        db.commit()

        assert _expiring_soon(m, 10) == 10


# ── Full recommendation ────────────────────────────────────────────

class TestBuildRecommendation:
    def test_critical_when_stockout_before_delivery(self, db):
        """If runway < lead_time, urgency should be CRITICAL."""
        s = _supplier(db, lead_time=5)
        m = _medicine(db)
        b = _batch(db, m, s, qty=3)

        # Sells 10/day over 30 days → avg ~3.33/day, 3 units left → <1 day of stock
        for day in range(10):
            _out_movement(db, b, 10, days_ago=day + 1)
        db.commit()

        rec = build_recommendation(m, db, window_days=30, target_days=30, safety_days=3)
        assert rec.urgency == "CRITICAL"
        assert rec.days_of_stock_remaining is not None
        assert rec.days_of_stock_remaining < 5

    def test_reorder_now_within_safety_buffer(self, db):
        s = _supplier(db, lead_time=3)
        m = _medicine(db)
        b = _batch(db, m, s, qty=15)

        # 150 units sold over 30 days → avg 5/day, 15 stock → 3 days remaining
        # lead_time=3, safety=5 → 3 ≤ 3+5=8 → REORDER_NOW
        for day in range(30):
            _out_movement(db, b, 5, days_ago=day + 1)
        db.commit()

        rec = build_recommendation(m, db, window_days=30, target_days=30, safety_days=5)
        assert rec.urgency in ("CRITICAL", "REORDER_NOW")
        assert rec.recommended_qty > 0

    def test_adequate_stock(self, db):
        s = _supplier(db, lead_time=2)
        m = _medicine(db)
        b = _batch(db, m, s, qty=500)

        # Only sells 2/day → 250 days of stock
        for day in range(10):
            _out_movement(db, b, 2, days_ago=day + 1)
        db.commit()

        rec = build_recommendation(m, db, window_days=30, target_days=30, safety_days=5)
        assert rec.urgency in ("ADEQUATE", "OVERSTOCKED")

    def test_no_sales_with_stock(self, db):
        m = _medicine(db)
        _batch(db, m, qty=100)
        db.commit()

        rec = build_recommendation(m, db, window_days=30)
        assert rec.urgency == "NO_SALES"
        assert rec.avg_daily_sales == 0
        assert rec.days_of_stock_remaining is None

    def test_no_sales_no_stock_is_critical(self, db):
        m = _medicine(db)
        _batch(db, m, qty=0)
        db.commit()

        rec = build_recommendation(m, db, window_days=30)
        assert rec.urgency == "CRITICAL"

    def test_recommended_qty_calculation(self, db):
        s = _supplier(db, lead_time=3)
        m = _medicine(db)
        b = _batch(db, m, s, qty=20, price=10.0)

        # 10 sales over 30 days → 0.333/day
        _out_movement(db, b, 10, days_ago=15)
        db.commit()

        rec = build_recommendation(m, db, window_days=30, target_days=30, safety_days=5)

        # target_stock = ceil(0.333 * 30) + ceil(0.333 * 5) = 10 + 2 = 12
        # recommended = max(0, 12 - 20) = 0  (stock is enough)
        assert rec.recommended_qty == 0
        assert rec.estimated_cost == 0.0

    def test_estimated_cost_uses_latest_price(self, db):
        s = _supplier(db, lead_time=2)
        m = _medicine(db)

        # Two batches: older cheaper, newer more expensive
        b1 = Batch(
            medicine_id=m.id, supplier_id=s.id,
            batch_number="OLD-1",
            expiry_date=date.today() + timedelta(days=200),
            quantity=5, purchase_price=2.0, mrp=3.0,
        )
        b2 = Batch(
            medicine_id=m.id, supplier_id=s.id,
            batch_number="NEW-2",
            expiry_date=date.today() + timedelta(days=300),
            quantity=5, purchase_price=8.0, mrp=12.0,
        )
        db.add_all([b1, b2])
        db.flush()

        # Heavy sales to trigger a reorder
        for day in range(20):
            _out_movement(db, b2, 3, days_ago=day + 1)
        db.commit()

        rec = build_recommendation(m, db, window_days=30, target_days=30, safety_days=5)
        assert rec.latest_unit_price == 8.0  # Uses the newer batch's price


# ── get_all_recommendations ─────────────────────────────────────────

class TestGetAllRecommendations:
    def test_returns_sorted_list(self, db):
        s = _supplier(db)
        m1 = _medicine(db, name="Adequate Med")
        b1 = _batch(db, m1, s, qty=500)
        _out_movement(db, b1, 2, days_ago=5)

        m2 = _medicine(db, name="Critical Med")
        b2 = _batch(db, m2, s, qty=2)
        # Heavy sales: 100 units over 10 days → avg ~3.33/day, only 2 left
        for day in range(10):
            _out_movement(db, b2, 10, days_ago=day + 1)

        db.commit()

        recs = get_all_recommendations(db, window_days=30)
        assert len(recs) == 2
        # Critical should come first
        assert recs[0]["medicine_name"] == "Critical Med"
        assert recs[0]["urgency"] == "CRITICAL"

    def test_empty_database(self, db):
        recs = get_all_recommendations(db)
        assert recs == []
