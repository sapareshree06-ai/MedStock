
from datetime import date, datetime, timezone
from sqlalchemy import (
    String,
    Integer,
    Float,
    Date,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Medicine(Base):
    __tablename__ = "medicines"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), index=True)
    generic_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(150), nullable=True)
    reorder_level: Mapped[int] = mapped_column(Integer, default=10)

    batches = relationship(
        "Batch",
        back_populates="medicine",
        cascade="all, delete-orphan",
    )


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)

    batches = relationship("Batch", back_populates="supplier")


class Batch(Base):
    __tablename__ = "batches"
    __table_args__ = (
        UniqueConstraint(
            "medicine_id",
            "batch_number",
            name="uq_batch_medicine_batch_number",
        ),
        CheckConstraint("quantity >= 0", name="ck_batch_quantity_nonnegative"),
        CheckConstraint("purchase_price >= 0", name="ck_batch_purchase_price_nonnegative"),
        CheckConstraint("mrp >= 0", name="ck_batch_mrp_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id"))
    supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id"),
        nullable=True,
    )
    batch_number: Mapped[str] = mapped_column(String(100), index=True)
    manufacturing_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date] = mapped_column(Date, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    purchase_price: Mapped[float] = mapped_column(Float, default=0)
    mrp: Mapped[float] = mapped_column(Float, default=0)

    medicine = relationship("Medicine", back_populates="batches")
    supplier = relationship("Supplier", back_populates="batches")
    movements = relationship(
        "StockMovement",
        back_populates="batch",
        cascade="all, delete-orphan",
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_movement_quantity_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    movement_type: Mapped[str] = mapped_column(String(20))
    quantity: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))   
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    batch = relationship("Batch", back_populates="movements")