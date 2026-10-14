from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Medicine, Batch

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    medicines = db.scalars(select(Medicine)).all()
    batches = db.scalars(select(Batch)).all()

    total_units = sum(b.quantity for b in batches)
    inventory_value = sum(b.quantity * b.purchase_price for b in batches)

    cutoff = date.today() + timedelta(days=90)
    expiry_value = sum(
        b.quantity * b.purchase_price
        for b in batches
        if b.quantity > 0 and date.today() <= b.expiry_date <= cutoff
    )

    low_count = 0
    for medicine in medicines:
        usable = sum(
            b.quantity for b in medicine.batches
            if b.quantity > 0 and b.expiry_date >= date.today()
        )
        if usable <= medicine.reorder_level:
            low_count += 1

    return {
        "medicine_count": len(medicines),
        "batch_count": len(batches),
        "total_units": total_units,
        "inventory_value": round(inventory_value, 2),
        "near_expiry_value": round(expiry_value, 2),
        "low_stock_medicines": low_count,
    }
