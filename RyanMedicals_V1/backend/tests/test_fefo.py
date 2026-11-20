
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Medicine, Batch, StockMovement
from app.routers.stock import fefo_preview, stock_out
from app.schemas import StockOut


@pytest.fixture
def db():
    # A fresh, in-memory database for every test.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

    Base.metadata.create_all(bind=engine)
    session = TestingSession()

    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def create_batch(db, medicine_id, number, expiry, quantity):
    batch = Batch(
        medicine_id=medicine_id,
        batch_number=number,
        expiry_date=expiry,
        quantity=quantity,
        purchase_price=1.0,
        mrp=2.0,
    )
    db.add(batch)
    db.flush()
    return batch


def test_fefo_uses_earliest_expiry_first(db):
    medicine = Medicine(
        name="FEFO Test Medicine",
        reorder_level=0,
    )
    db.add(medicine)
    db.flush()

    today = date.today()

    later = create_batch(
        db, medicine.id, "FEFO-LATER", today + timedelta(days=120), 100
    )
    earlier = create_batch(
        db, medicine.id, "FEFO-EARLIER", today + timedelta(days=30), 40
    )
    db.commit()

    result = stock_out(
        StockOut(medicine_id=medicine.id, quantity=60),
        db,
    )

    db.refresh(earlier)
    db.refresh(later)

    # The earliest-expiring batch must be exhausted first.
    assert earlier.quantity == 0
    assert later.quantity == 80

    movements = db.scalars(
        select(StockMovement)
        .where(StockMovement.movement_type == "OUT")
        .order_by(StockMovement.id)
    ).all()

    assert [(m.batch_id, m.quantity) for m in movements] == [
        (earlier.id, 40),
        (later.id, 20),
    ]


def test_fefo_preview_returns_plan_without_changing_stock(db):
    medicine = Medicine(name="Preview medicine", reorder_level=0)
    db.add(medicine)
    db.flush()
    first = create_batch(db, medicine.id, "PREVIEW-001", date.today() + timedelta(days=10), 3)
    second = create_batch(db, medicine.id, "PREVIEW-002", date.today() + timedelta(days=20), 8)
    db.commit()

    result = fefo_preview(StockOut(medicine_id=medicine.id, quantity=5), db)

    assert result["can_fulfill"] is True
    assert [(item["batch_id"], item["quantity_used"]) for item in result["allocations"]] == [(first.id, 3), (second.id, 2)]
    db.refresh(first)
    db.refresh(second)
    assert (first.quantity, second.quantity) == (3, 8)
    assert db.scalars(select(StockMovement)).all() == []


def test_insufficient_stock_changes_nothing(db):
    medicine = Medicine(
        name="Insufficient Stock Test",
        reorder_level=0,
    )
    db.add(medicine)
    db.flush()

    batch = create_batch(
        db,
        medicine.id,
        "INSUFFICIENT-TEST",
        date.today() + timedelta(days=60),
        10,
    )
    db.commit()

    with pytest.raises(HTTPException) as error:
        stock_out(
            StockOut(medicine_id=medicine.id, quantity=11),
            db,
        )

    assert error.value.status_code == 400

    db.refresh(batch)
    assert batch.quantity == 10

    movements = db.scalars(select(StockMovement)).all()
    assert movements == []


def test_fefo_skips_expired_batches(db):
    medicine = Medicine(
        name="Expired Batch Test",
        reorder_level=0,
    )
    db.add(medicine)
    db.flush()

    today = date.today()

    expired = create_batch(
        db, medicine.id, "EXPIRED-001",
        today - timedelta(days=10), 100
    )
    valid = create_batch(
        db, medicine.id, "VALID-001",
        today + timedelta(days=30), 20
    )
    db.commit()

    stock_out(
        StockOut(medicine_id=medicine.id, quantity=10),
        db,
    )

    db.refresh(expired)
    db.refresh(valid)

    assert expired.quantity == 100
    assert valid.quantity == 10


def test_fefo_rejects_when_only_expired_stock_exists(db):
    medicine = Medicine(
        name="Only Expired Stock",
        reorder_level=0,
    )
    db.add(medicine)
    db.flush()

    batch = create_batch(
        db, medicine.id, "EXPIRED-ONLY",
        date.today() - timedelta(days=1), 50
    )
    db.commit()

    with pytest.raises(HTTPException) as error:
        stock_out(
            StockOut(medicine_id=medicine.id, quantity=5),
            db,
        )

    assert error.value.status_code == 400
    assert "available 0" in error.value.detail

    db.refresh(batch)
    assert batch.quantity == 50

    movements = db.scalars(select(StockMovement)).all()
    assert len(movements) == 0


def test_fefo_skips_zero_quantity_batches(db):
    medicine = Medicine(
        name="Zero Quantity Test",
        reorder_level=0,
    )
    db.add(medicine)
    db.flush()

    today = date.today()

    empty = create_batch(
        db, medicine.id, "EMPTY-001",
        today + timedelta(days=10), 0
    )
    available = create_batch(
        db, medicine.id, "AVAILABLE-001",
        today + timedelta(days=20), 15
    )
    db.commit()

    stock_out(
        StockOut(medicine_id=medicine.id, quantity=5),
        db,
    )

    db.refresh(empty)
    db.refresh(available)

    assert empty.quantity == 0
    assert available.quantity == 10

    movements = db.scalars(
        select(StockMovement).where(
            StockMovement.movement_type == "OUT"
        )
    ).all()

    assert len(movements) == 1
    assert movements[0].batch_id == available.id
    assert movements[0].quantity == 5


def test_fefo_uses_batch_id_when_expiry_dates_are_equal(db):
    medicine = Medicine(
        name="Equal Expiry Test",
        reorder_level=0,
    )
    db.add(medicine)
    db.flush()

    expiry = date.today() + timedelta(days=30)

    first = create_batch(
        db, medicine.id, "EQUAL-001", expiry, 3
    )
    second = create_batch(
        db, medicine.id, "EQUAL-002", expiry, 5
    )
    db.commit()

    stock_out(
        StockOut(medicine_id=medicine.id, quantity=4),
        db,
    )

    db.refresh(first)
    db.refresh(second)

    assert first.quantity == 0
    assert second.quantity == 4

    movements = db.scalars(
        select(StockMovement)
        .where(StockMovement.movement_type == "OUT")
        .order_by(StockMovement.id)
    ).all()

    assert [(m.batch_id, m.quantity) for m in movements] == [
        (first.id, 3),
        (second.id, 1),
    ]
