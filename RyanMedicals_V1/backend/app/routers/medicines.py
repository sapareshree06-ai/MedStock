from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Medicine, Batch, Supplier
from ..schemas import MedicineCreate, MedicineOut, BatchCreate, BatchOut, SupplierCreate, SupplierOut

router = APIRouter(prefix="/api", tags=["Inventory"])


@router.post("/medicines", response_model=MedicineOut)
def create_medicine(data: MedicineCreate, db: Session = Depends(get_db)):
    medicine = Medicine(**data.model_dump())
    db.add(medicine)
    db.commit()
    db.refresh(medicine)
    return medicine


@router.get("/medicines", response_model=list[MedicineOut])
def list_medicines(db: Session = Depends(get_db)):
    return db.scalars(select(Medicine).order_by(Medicine.name)).all()


@router.post("/suppliers", response_model=SupplierOut)
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    supplier = Supplier(**data.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
    return db.scalars(select(Supplier).order_by(Supplier.name)).all()


@router.post("/batches", response_model=BatchOut)
def create_batch(data: BatchCreate, db: Session = Depends(get_db)):
    if not db.get(Medicine, data.medicine_id):
        raise HTTPException(404, "Medicine not found")
    if data.supplier_id and not db.get(Supplier, data.supplier_id):
        raise HTTPException(404, "Supplier not found")

    batch = Batch(**data.model_dump())
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


@router.get("/batches", response_model=list[BatchOut])
def list_batches(db: Session = Depends(get_db)):
    return db.scalars(select(Batch).order_by(Batch.expiry_date)).all()


@router.get("/alerts/low-stock")
def low_stock(db: Session = Depends(get_db)):
    medicines = db.scalars(select(Medicine)).all()
    result = []

    for medicine in medicines:
        total = sum(b.quantity for b in medicine.batches if b.expiry_date >= date.today())
        if total <= medicine.reorder_level:
            result.append({
                "medicine_id": medicine.id,
                "medicine": medicine.name,
                "quantity": total,
                "reorder_level": medicine.reorder_level,
            })
    return result


@router.get("/alerts/near-expiry")
def near_expiry(days: int = 90, db: Session = Depends(get_db)):
    cutoff = date.today() + timedelta(days=days)
    batches = db.scalars(
        select(Batch).where(
            Batch.quantity > 0,
            Batch.expiry_date >= date.today(),
            Batch.expiry_date <= cutoff
        ).order_by(Batch.expiry_date)
    ).all()

    return [{
        "batch_id": b.id,
        "medicine_id": b.medicine_id,
        "medicine": b.medicine.name,
        "batch_number": b.batch_number,
        "expiry_date": b.expiry_date,
        "quantity": b.quantity,
        "value_at_risk": round(b.quantity * b.purchase_price, 2)
    } for b in batches]
