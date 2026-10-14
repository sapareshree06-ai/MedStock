from datetime import date, datetime
from pydantic import BaseModel, ConfigDict


class MedicineCreate(BaseModel):
    name: str
    generic_name: str | None = None
    category: str | None = None
    manufacturer: str | None = None
    reorder_level: int = 10


class MedicineOut(MedicineCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class SupplierCreate(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None


class SupplierOut(SupplierCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class BatchCreate(BaseModel):
    medicine_id: int
    supplier_id: int | None = None
    batch_number: str
    manufacturing_date: date | None = None
    expiry_date: date
    quantity: int = 0
    purchase_price: float = 0
    mrp: float = 0


class BatchOut(BatchCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class StockIn(BaseModel):
    batch_id: int
    quantity: int
    notes: str | None = None


class StockOut(BaseModel):
    medicine_id: int
    quantity: int
    notes: str | None = None


class MovementOut(BaseModel):
    id: int
    batch_id: int
    movement_type: str
    quantity: int
    timestamp: datetime
    notes: str | None = None
    model_config = ConfigDict(from_attributes=True)
