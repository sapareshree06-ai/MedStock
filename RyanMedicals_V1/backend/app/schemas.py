
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MedicineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    generic_name: str | None = Field(default=None, max_length=150)
    category: str | None = Field(default=None, max_length=100)
    manufacturer: str | None = Field(default=None, max_length=150)
    reorder_level: int = Field(default=10, ge=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Medicine name cannot be blank")
        return value


class MedicineOut(MedicineCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=150)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Supplier name cannot be blank")
        return value


class SupplierOut(SupplierCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class BatchCreate(BaseModel):
    medicine_id: int = Field(gt=0)
    supplier_id: int | None = Field(default=None, gt=0)
    batch_number: str = Field(min_length=1, max_length=100)
    manufacturing_date: date | None = None
    expiry_date: date
    quantity: int = Field(default=0, ge=0)
    purchase_price: float = Field(default=0, ge=0)
    mrp: float = Field(default=0, ge=0)

    @field_validator("batch_number")
    @classmethod
    def validate_batch_number(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Batch number cannot be blank")
        return value


class BatchOut(BatchCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class StockIn(BaseModel):
    batch_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    notes: str | None = None


class StockOut(BaseModel):
    medicine_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    notes: str | None = None


class MovementOut(BaseModel):
    id: int
    batch_id: int
    movement_type: str
    quantity: int
    timestamp: datetime
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)