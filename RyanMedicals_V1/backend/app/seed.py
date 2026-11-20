"""
Seed script — creates demo data with 30 days of historical stock movements
so the reorder recommendation engine has meaningful velocity data to work with.

Usage: cd backend && python -m app.seed [--force]
"""

import random
import sys
from datetime import date, datetime, timedelta, timezone

from .database import Base, SessionLocal, engine
from .models import Batch, Medicine, StockMovement, Supplier

Base.metadata.create_all(bind=engine)

db = SessionLocal()
force = "--force" in sys.argv

try:
    if force:
        db.query(StockMovement).delete()
        db.query(Batch).delete()
        db.query(Medicine).delete()
        db.query(Supplier).delete()
        db.commit()
        print("Cleared existing data for fresh seed.")

    if not db.query(Medicine).first() or force:
        # ── Suppliers ───────────────────────────────────────────────────
        suppliers = [
            Supplier(
                name="ABC Pharma Distributors",
                phone="9876543210",
                email="abc@example.com",
                lead_time_days=2,
            ),
            Supplier(
                name="MedLine Wholesale",
                phone="9876500001",
                email="medline@example.com",
                lead_time_days=4,
            ),
            Supplier(
                name="QuickMed Logistics",
                phone="9876500002",
                email="quickmed@example.com",
                lead_time_days=1,
            ),
        ]
        db.add_all(suppliers)
        db.flush()

        # ── Medicines ───────────────────────────────────────────────────
        # (name, generic, category, manufacturer, reorder_level, avg_sales_per_day)
        medicine_specs = [
            ("Paracetamol 500mg", "Paracetamol", "Analgesic", "Sample Pharma", 20, 8),
            ("Amoxicillin 500mg", "Amoxicillin", "Antibiotic", "Sample Pharma", 15, 3),
            ("Cetirizine 10mg", "Cetirizine", "Antihistamine", "HealthCorp", 10, 5),
            ("Metformin 500mg", "Metformin", "Antidiabetic", "DiaCare Labs", 25, 10),
            ("Omeprazole 20mg", "Omeprazole", "Antacid", "GutWell Pharma", 15, 4),
            ("Azithromycin 500mg", "Azithromycin", "Antibiotic", "BioMed Inc", 10, 1),
            ("Vitamin D3 60K IU", "Cholecalciferol", "Supplement", "NutriVita", 5, 0),
        ]

        medicines = [
            Medicine(
                name=name,
                generic_name=generic,
                category=cat,
                manufacturer=mfg,
                reorder_level=rl,
            )
            for name, generic, cat, mfg, rl, _ in medicine_specs
        ]
        db.add_all(medicines)
        db.flush()

        today = date.today()
        random.seed(42)  # reproducible demo data

        # ── Batches ─────────────────────────────────────────────────────
        # Each medicine gets batches configured to demonstrate diverse inventory states:
        # Critical (stockout before lead time), Reorder Now, Adequate, Overstocked, and No Sales.
        batch_configs = [
            # (medicine_index, supplier_index, batch#, mfg_offset, exp_offset, initial_qty, price, mrp)
            (0, 0, "PCM-A101", -180, 45, 150, 1.20, 2.00),
            (0, 0, "PCM-B205", -60, 300, 200, 1.30, 2.10),
            (1, 0, "AMX-C301", -100, 500, 70, 4.50, 7.00),
            (1, 1, "AMX-D402", -30, 400, 40, 4.60, 7.00),
            (2, 1, "CTZ-E101", -90, 250, 100, 2.00, 3.50),
            (2, 1, "CTZ-F202", -20, 350, 100, 2.10, 3.50),
            (3, 0, "MET-G101", -120, 400, 500, 1.50, 2.80),
            (3, 2, "MET-H202", -40, 500, 300, 1.55, 2.80),
            (4, 2, "OMP-I101", -150, 60, 50, 3.00, 5.50),
            (4, 2, "OMP-J202", -50, 300, 70, 3.10, 5.50),
            (5, 1, "AZT-K101", -200, 150, 18, 12.00, 18.00),
            (6, 0, "VTD-L101", -60, 600, 30, 8.00, 15.00),
        ]

        batches = [
            Batch(
                medicine_id=medicines[med_i].id,
                supplier_id=suppliers[sup_i].id,
                batch_number=bn,
                manufacturing_date=today + timedelta(days=mfg_off),
                expiry_date=today + timedelta(days=exp_off),
                quantity=qty,
                purchase_price=price,
                mrp=mrp,
            )
            for med_i, sup_i, bn, mfg_off, exp_off, qty, price, mrp in batch_configs
        ]
        db.add_all(batches)
        db.flush()

        # Record initial stock-in movements for each batch with stock.
        for b in batches:
            if b.quantity > 0:
                db.add(
                    StockMovement(
                        batch_id=b.id,
                        movement_type="IN",
                        quantity=b.quantity,
                        timestamp=datetime.combine(
                            today - timedelta(days=35),
                            datetime.min.time(),
                            tzinfo=timezone.utc,
                        ),
                        notes=f"Initial stock for batch {b.batch_number}",
                    )
                )
        db.flush()

        # ── Historical stock-out movements (30 days) ────────────────────
        medicine_batches = {}
        for b in batches:
            medicine_batches.setdefault(b.medicine_id, []).append(b)

        for day_offset in range(30, 0, -1):
            movement_date = today - timedelta(days=day_offset)
            ts = datetime.combine(
                movement_date, datetime.min.time(), tzinfo=timezone.utc
            ).replace(hour=random.randint(9, 18), minute=random.randint(0, 59))

            for med_idx, (_, _, _, _, _, avg_sales) in enumerate(medicine_specs):
                if avg_sales == 0:
                    continue

                daily = max(
                    0, int(avg_sales + random.randint(-avg_sales // 2, avg_sales // 2))
                )
                if daily == 0:
                    continue

                med_id = medicines[med_idx].id
                med_batches = sorted(
                    [
                        b
                        for b in medicine_batches.get(med_id, [])
                        if b.quantity > 0 and b.expiry_date >= movement_date
                    ],
                    key=lambda b: (b.expiry_date, b.id),
                )

                remaining = daily
                for b in med_batches:
                    if remaining <= 0:
                        break
                    used = min(b.quantity, remaining)
                    b.quantity -= used
                    remaining -= used

                    db.add(
                        StockMovement(
                            batch_id=b.id,
                            movement_type="OUT",
                            quantity=used,
                            timestamp=ts,
                            notes="Daily sales",
                        )
                    )

        db.commit()

        for m in medicines:
            usable = sum(
                b.quantity for b in m.batches if b.quantity > 0 and b.expiry_date >= today
            )
            print(f"  {m.name:30s}  usable stock: {usable}")

        print("\nSeed data created with 30 days of sales history.")
    else:
        print("Database already contains data; seed skipped.")
except Exception:
    db.rollback()
    raise
finally:
    db.close()