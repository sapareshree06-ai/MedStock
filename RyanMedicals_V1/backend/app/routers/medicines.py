
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Medicine, Batch, Supplier, StockMovement
from ..schemas import (
    MedicineCreate,
    MedicineOut,
    BatchCreate,
    BatchOut,
    SupplierCreate,
    SupplierOut,
)

router = APIRouter(prefix="/api", tags=["Inventory"])


@router.post("/medicines", response_model=MedicineOut)
def create_medicine(data: MedicineCreate, db: Session = Depends(get_db)):
    medicine = Medicine(**data.model_dump())
    db.add(medicine)

    try:
        db.commit()
        db.refresh(medicine)
    except Exception:
        db.rollback()
        raise

    return medicine


@router.get("/medicines", response_model=list[MedicineOut])
def list_medicines(db: Session = Depends(get_db)):
    return db.scalars(select(Medicine).order_by(Medicine.name)).all()


@router.post("/suppliers", response_model=SupplierOut)
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    supplier = Supplier(**data.model_dump())
    db.add(supplier)

    try:
        db.commit()
        db.refresh(supplier)
    except Exception:
        db.rollback()
        raise

    return supplier


@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
    return db.scalars(select(Supplier).order_by(Supplier.name)).all()


@router.post("/batches", response_model=BatchOut)
def create_batch(data: BatchCreate, db: Session = Depends(get_db)):
    if not db.get(Medicine, data.medicine_id):
        raise HTTPException(status_code=404, detail="Medicine not found")

    if data.supplier_id is not None and not db.get(Supplier, data.supplier_id):
        raise HTTPException(status_code=404, detail="Supplier not found")

    duplicate = db.scalar(
        select(Batch.id).where(
            Batch.medicine_id == data.medicine_id,
            Batch.batch_number == data.batch_number,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail="This batch number already exists for this medicine.",
        )

    batch = Batch(**data.model_dump())
    db.add(batch)

    try:
        # Flush assigns the batch ID without committing the transaction.
        db.flush()

        # Record initial stock in the same transaction as batch creation.
        if data.quantity > 0:
            db.add(
                StockMovement(
                    batch_id=batch.id,
                    movement_type="IN",
                    quantity=data.quantity,
                    notes=f"Initial stock for batch {data.batch_number}",
                )
            )

        db.commit()
        db.refresh(batch)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Batch could not be created. Check for a duplicate batch number.",
        )
    except Exception:
        db.rollback()
        raise

    return batch


@router.get("/batches", response_model=list[BatchOut])
def list_batches(db: Session = Depends(get_db)):
    return db.scalars(select(Batch).order_by(Batch.expiry_date, Batch.id)).all()


@router.get("/alerts/low-stock")
def low_stock(db: Session = Depends(get_db)):
    medicines = db.scalars(select(Medicine).order_by(Medicine.name)).all()
    result = []
    today = date.today()

    for medicine in medicines:
        total = sum(
            batch.quantity
            for batch in medicine.batches
            if batch.expiry_date >= today
        )

        if total <= medicine.reorder_level:
            result.append(
                {
                    "medicine_id": medicine.id,
                    "medicine": medicine.name,
                    "quantity": total,
                    "reorder_level": medicine.reorder_level,
                }
            )

    return result


@router.get("/alerts/near-expiry")
def near_expiry(days: int = 90, db: Session = Depends(get_db)):
    if days < 0:
        raise HTTPException(
            status_code=400,
            detail="Days must be zero or greater.",
        )

    today = date.today()
    cutoff = today + timedelta(days=days)

    batches = db.scalars(
        select(Batch)
        .where(
            Batch.quantity > 0,
            Batch.expiry_date >= today,
            Batch.expiry_date <= cutoff,
        )
        .order_by(Batch.expiry_date, Batch.id)
    ).all()

    return [
        {
            "batch_id": batch.id,
            "medicine_id": batch.medicine_id,
            "medicine": batch.medicine.name,
            "batch_number": batch.batch_number,
            "expiry_date": batch.expiry_date,
            "quantity": batch.quantity,
            "value_at_risk": round(batch.quantity * batch.purchase_price, 2),
        }
        for batch in batches
    ]