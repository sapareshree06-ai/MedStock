
from sqlalchemy import text

from .database import engine


def main():
    print("Starting inventory migration...")

    try:
        with engine.begin() as connection:
            duplicates = connection.execute(
                text("""
                    SELECT medicine_id, batch_number
                    FROM batches
                    GROUP BY medicine_id, batch_number
                    HAVING COUNT(*) > 1
                """)
            ).all()

            renamed = 0

            for medicine_id, batch_number in duplicates:
                ids = connection.execute(
                    text("""
                        SELECT id
                        FROM batches
                        WHERE medicine_id = :medicine_id
                          AND batch_number = :batch_number
                        ORDER BY id
                    """),
                    {
                        "medicine_id": medicine_id,
                        "batch_number": batch_number,
                    },
                ).scalars().all()

                # Keep the oldest record's original batch number.
                for batch_id in ids[1:]:
                    candidate = f"{batch_number}-LEGACY-ID-{batch_id}"

                    # Avoid colliding with an existing batch label.
                    suffix = 1
                    while connection.execute(
                        text("""
                            SELECT 1 FROM batches
                            WHERE medicine_id = :medicine_id
                              AND batch_number = :candidate
                        """),
                        {
                            "medicine_id": medicine_id,
                            "candidate": candidate,
                        },
                    ).first():
                        candidate = (
                            f"{batch_number}-LEGACY-ID-{batch_id}-{suffix}"
                        )
                        suffix += 1

                    connection.execute(
                        text("""
                            UPDATE batches
                            SET batch_number = :candidate
                            WHERE id = :batch_id
                        """),
                        {
                            "candidate": candidate,
                            "batch_id": batch_id,
                        },
                    )
                    print(
                        f"Renamed batch ID {batch_id}: "
                        f"{batch_number} -> {candidate}"
                    )
                    renamed += 1

            # Enforce uniqueness for each medicine's batch numbers.
            connection.execute(
                text("""
                    CREATE UNIQUE INDEX IF NOT EXISTS
                    uq_batch_medicine_batch_number
                    ON batches (medicine_id, batch_number)
                """)
            )

        print(f"\nMigration completed. Renamed {renamed} duplicate record(s).")
        print("Unique batch-number index is in place.")

    except Exception as exc:
        print("\nMigration failed. The transaction was rolled back.")
        print(f"Reason: {exc}")
        raise


if __name__ == "__main__":
    main()