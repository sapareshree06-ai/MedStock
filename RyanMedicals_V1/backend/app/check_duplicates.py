
from sqlalchemy import func, select

from .database import SessionLocal
from .models import Batch, Medicine, StockMovement


def main():
    db = SessionLocal()

    try:
        duplicates = db.execute(
            select(
                Batch.medicine_id,
                Batch.batch_number,
                func.count(Batch.id).label("batch_count"),
            )
            .group_by(Batch.medicine_id, Batch.batch_number)
            .having(func.count(Batch.id) > 1)
        ).all()

        if not duplicates:
            print("No duplicate batch numbers found.")
            return

        print("\nDUPLICATE BATCHES FOUND")
        print("=" * 60)

        for medicine_id, batch_number, count in duplicates:
            medicine = db.get(Medicine, medicine_id)

            batches = db.scalars(
                select(Batch).where(
                    Batch.medicine_id == medicine_id,
                    Batch.batch_number == batch_number,
                ).order_by(Batch.id)
            ).all()

            print(
                f"\nMedicine: {medicine.name if medicine else medicine_id}"
            )
            print(f"Batch number: {batch_number}")
            print(f"Duplicate records: {count}")

            for batch in batches:
                movement_count = db.scalar(
                    select(func.count(StockMovement.id)).where(
                        StockMovement.batch_id == batch.id
                    )
                )

                print(
                    f"  ID={batch.id} | Quantity={batch.quantity} | "
                    f"Expiry={batch.expiry_date} | "
                    f"Movement records={movement_count}"
                )

    finally:
        db.close()


if __name__ == "__main__":
    main()