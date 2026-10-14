from datetime import date, timedelta
from .database import Base, engine, SessionLocal
from .models import Medicine, Supplier, Batch, StockMovement

Base.metadata.create_all(bind=engine)

db = SessionLocal()

if not db.query(Medicine).first():
    supplier = Supplier(
        name="ABC Pharma Distributors",
        phone="9876543210",
        email="supplier@example.com",
    )
    db.add(supplier)
    db.flush()

    paracetamol = Medicine(
        name="Paracetamol 500mg",
        generic_name="Paracetamol",
        category="Analgesic",
        manufacturer="Sample Pharma",
        reorder_level=20,
    )
    amoxicillin = Medicine(
        name="Amoxicillin 500mg",
        generic_name="Amoxicillin",
        category="Antibiotic",
        manufacturer="Sample Pharma",
        reorder_level=15,
    )
    db.add_all([paracetamol, amoxicillin])
    db.flush()

    batches = [
        Batch(
            medicine_id=paracetamol.id,
            supplier_id=supplier.id,
            batch_number="PCM-A101",
            manufacturing_date=date.today() - timedelta(days=180),
            expiry_date=date.today() + timedelta(days=45),
            quantity=40,
            purchase_price=1.20,
            mrp=2.00,
        ),
        Batch(
            medicine_id=paracetamol.id,
            supplier_id=supplier.id,
            batch_number="PCM-B205",
            manufacturing_date=date.today() - timedelta(days=60),
            expiry_date=date.today() + timedelta(days=300),
            quantity=100,
            purchase_price=1.30,
            mrp=2.10,
        ),
        Batch(
            medicine_id=amoxicillin.id,
            supplier_id=supplier.id,
            batch_number="AMX-C301",
            manufacturing_date=date.today() - timedelta(days=100),
            expiry_date=date.today() + timedelta(days=500),
            quantity=12,
            purchase_price=4.50,
            mrp=7.00,
        ),
    ]
    db.add_all(batches)
    db.commit()

    print("Seed data created.")
else:
    print("Database already contains data; seed skipped.")

db.close()
