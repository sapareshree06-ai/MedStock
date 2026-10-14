from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Batch, Medicine, StockMovement
from ..schemas import StockIn, StockOut, MovementOut

router = APIRouter(prefix="/api/stock", tags=["Stock"])


@router.post("/in")
def stock_in(data: StockIn, db: Session = Depends(get_db)):
    batch = db.get(Batch, data.batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")
    if data.quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than zero")

    batch.quantity += data.quantity
    movement = StockMovement(
        batch_id=batch.id,
        movement_type="IN",
        quantity=data.quantity,
        notes=data.notes,
    )
    db.add(movement)
    db.commit()

    return {"message": "Stock added", "batch_id": batch.id, "new_quantity": batch.quantity}


@router.post("/out")
def stock_out(data: StockOut, db: Session = Depends(get_db)):
    if data.quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than zero")

    # FEFO: earliest expiry first, ignoring expired/empty batches.
    batches = db.scalars(
        select(Batch)
        .where(
            Batch.medicine_id == data.medicine_id,
            Batch.quantity > 0,
            Batch.expiry_date >= date.today(),
        )
        .order_by(Batch.expiry_date.asc(), Batch.id.asc())
    ).all()

    available = sum(b.quantity for b in batches)
    if available < data.quantity:
        raise HTTPException(
            400,
            f"Insufficient usable stock. Requested {data.quantity}, available {available}."
        )

    remaining = data.quantity
    allocations = []

    for batch in batches:
        if remaining == 0:
            break

        used = min(batch.quantity, remaining)
        batch.quantity -= used
        remaining -= used

        db.add(StockMovement(
            batch_id=batch.id,
            movement_type="OUT",
            quantity=used,
            notes=data.notes or "FEFO stock issue",
        ))

        allocations.append({
            "batch_id": batch.id,
            "batch_number": batch.batch_number,
            "expiry_date": batch.expiry_date,
            "quantity_used": used,
        })

    db.commit()

    return {
        "message": "Stock issued using FEFO",
        "medicine_id": data.medicine_id,
        "requested": data.quantity,
        "allocations": allocations,
    }


@router.get("/movements", response_model=list[MovementOut])
def movements(db: Session = Depends(get_db)):
    return db.scalars(
        select(StockMovement).order_by(StockMovement.timestamp.desc())
    ).all()
