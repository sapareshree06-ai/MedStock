
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Medicine, Batch, StockMovement
from app.routers.stock import stock_out
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