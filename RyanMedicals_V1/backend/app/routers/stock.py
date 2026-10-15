
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Batch, Medicine, StockMovement
from ..schemas import StockIn, StockOut, MovementOut

router = APIRouter(prefix="/api/stock", tags=["Stock"])


@router.post("/in")
def stock_in(data: StockIn, db: Session = Depends(get_db)):
    try:
        batch = db.scalar(
            select(Batch)
            .where(Batch.id == data.batch_id)
            .with_for_update()
        )

        if batch is None:
            raise HTTPException(status_code=404, detail="Batch not found")

        batch.quantity += data.quantity

        db.add(
            StockMovement(
                batch_id=batch.id,
                movement_type="IN",
                quantity=data.quantity,
                notes=data.notes or "Stock received",
            )
        )

        db.commit()
        db.refresh(batch)

        return {
            "message": "Stock added",
            "batch_id": batch.id,
            "new_quantity": batch.quantity,
        }

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Stock-in transaction failed. No changes were saved.",
        )
    except Exception:
        db.rollback()
        raise


@router.post("/out")
def stock_out(data: StockOut, db: Session = Depends(get_db)):
    try:
        medicine = db.get(Medicine, data.medicine_id)

        if medicine is None:
            raise HTTPException(status_code=404, detail="Medicine not found")

        today = date.today()

        # FEFO: earliest expiry first; exclude expired and empty batches.
        batches = db.scalars(
            select(Batch)
            .where(
                Batch.medicine_id == data.medicine_id,
                Batch.quantity > 0,
                Batch.expiry_date >= today,
            )
            .order_by(Batch.expiry_date.asc(), Batch.id.asc())
            .with_for_update()
        ).all()

        available = sum(batch.quantity for batch in batches)

        if available < data.quantity:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient usable stock. Requested {data.quantity}, "
                    f"available {available}."
                ),
            )

        remaining = data.quantity
        allocations = []

        for batch in batches:
            if remaining == 0:
                break

            used = min(batch.quantity, remaining)
            batch.quantity -= used
            remaining -= used

            db.add(
                StockMovement(
                    batch_id=batch.id,
                    movement_type="OUT",
                    quantity=used,
                    notes=data.notes or "FEFO stock issue",
                )
            )

            allocations.append(
                {
                    "batch_id": batch.id,
                    "batch_number": batch.batch_number,
                    "expiry_date": batch.expiry_date,
                    "quantity_used": used,
                }
            )

        db.commit()

        return {
            "message": "Stock issued using FEFO",
            "medicine_id": data.medicine_id,
            "requested": data.quantity,
            "allocations": allocations,
        }

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Stock-out transaction failed. No changes were saved.",
        )
    except Exception:
        db.rollback()
        raise


@router.get("/movements", response_model=list[MovementOut])
def movements(db: Session = Depends(get_db)):
    return db.scalars(
        select(StockMovement).order_by(
            StockMovement.timestamp.desc(),
            StockMovement.id.desc(),
        )
    ).all()