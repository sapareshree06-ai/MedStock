from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Batch, Medicine, StockMovement
from app.routers.medicines import create_batch as create_batch_endpoint
from app.routers.stock import fefo_preview, stock_in, stock_out
from app.schemas import BatchCreate, StockIn, StockOut


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

    stock_out(
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
    assert [(item["batch_id"], item["quantity_used"]) for item in result["allocations"]] == [
        (first.id, 3),
        (second.id, 2),
    ]
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


def test_stock_in_updates_quantity_and_records_movement(db):
    medicine = Medicine(
        name="Stock In Audit Medicine",
        reorder_level=5,
    )
    db.add(medicine)
    db.flush()

    batch = create_batch(
        db,
        medicine.id,
        "STOCK-IN-01",
        date.today() + timedelta(days=90),
        15,
    )
    db.commit()

    stock_in(
        StockIn(batch_id=batch.id, quantity=25, notes="Supplier restock"),
        db,
    )

    db.refresh(batch)
    assert batch.quantity == 40

    movements = db.scalars(
        select(StockMovement).order_by(StockMovement.id)
    ).all()
    assert len(movements) == 1
    assert movements[0].batch_id == batch.id
    assert movements[0].movement_type == "IN"
    assert movements[0].quantity == 25
    assert movements[0].notes == "Supplier restock"


def test_fefo_skips_expired_batches_and_records_multi_batch_movements(db):
    medicine = Medicine(
        name="Multi Batch FEFO Medicine",
        reorder_level=0,
    )
    db.add(medicine)
    db.flush()

    today = date.today()

    expired = create_batch(
        db, medicine.id, "BATCH-EXPIRED", today - timedelta(days=1), 50
    )
    first_valid = create_batch(
        db, medicine.id, "BATCH-EXP-15D", today + timedelta(days=15), 20
    )
    second_valid = create_batch(
        db, medicine.id, "BATCH-EXP-45D", today + timedelta(days=45), 35
    )
    third_valid = create_batch(
        db, medicine.id, "BATCH-EXP-90D", today + timedelta(days=90), 50
    )
    db.commit()

    stock_out(
        StockOut(medicine_id=medicine.id, quantity=70, notes="Prescription batch"),
        db,
    )

    db.refresh(expired)
    db.refresh(first_valid)
    db.refresh(second_valid)
    db.refresh(third_valid)

    # Expired batch must never be issued; valid batches drain in expiry order.
    assert expired.quantity == 50
    assert first_valid.quantity == 0
    assert second_valid.quantity == 0
    assert third_valid.quantity == 35

    movements = db.scalars(
        select(StockMovement)
        .where(StockMovement.movement_type == "OUT")
        .order_by(StockMovement.id)
    ).all()

    assert [(m.batch_id, m.quantity) for m in movements] == [
        (first_valid.id, 20),
        (second_valid.id, 35),
        (third_valid.id, 15),
    ]


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


def test_batch_creation_records_initial_in_movement_and_rejects_duplicate_409(db):
    medicine = Medicine(
        name="Batch Audit Medicine",
        reorder_level=10,
    )
    db.add(medicine)
    db.commit()
    db.refresh(medicine)

    expiry = date.today() + timedelta(days=180)
    created = create_batch_endpoint(
        BatchCreate(
            medicine_id=medicine.id,
            batch_number="INIT-BATCH-01",
            expiry_date=expiry,
            quantity=30,
            purchase_price=12.0,
            mrp=18.0,
        ),
        db,
    )

    assert created.quantity == 30

    movements = db.scalars(
        select(StockMovement).where(StockMovement.batch_id == created.id)
    ).all()
    assert len(movements) == 1
    assert movements[0].movement_type == "IN"
    assert movements[0].quantity == 30

    # Duplicate (medicine_id, batch_number) must return HTTP 409 without extra records.
    with pytest.raises(HTTPException) as error:
        create_batch_endpoint(
            BatchCreate(
                medicine_id=medicine.id,
                batch_number="INIT-BATCH-01",
                expiry_date=expiry,
                quantity=20,
                purchase_price=12.0,
                mrp=18.0,
            ),
            db,
        )

    assert error.value.status_code == 409

    batches = db.scalars(
        select(Batch).where(
            Batch.medicine_id == medicine.id,
            Batch.batch_number == "INIT-BATCH-01",
        )
    ).all()
    assert len(batches) == 1
    assert batches[0].quantity == 30

    movements_after = db.scalars(
        select(StockMovement).where(StockMovement.batch_id == created.id)
    ).all()
    assert len(movements_after) == 1