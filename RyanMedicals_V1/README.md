# Ryan Medicals — V1 Core Inventory

A student-level pharmacy inventory management foundation focused on backend capability.

## V1 capabilities
- Medicine master data
- Batch-level inventory
- Supplier records
- Stock IN / OUT
- FEFO (First Expiry, First Out) stock issuance
- Low-stock detection
- Near-expiry detection
- Stock movement history
- Basic dashboard summary
- Tiny vanilla HTML/CSS/JS frontend
- SQLite works immediately; PostgreSQL is supported through DATABASE_URL

## Project structure

backend/
  app/
    main.py
    database.py
    models.py
    schemas.py
    seed.py
    routers/
      dashboard.py
      medicines.py
      stock.py
    __init__.py
  requirements.txt
  .env.example

frontend/
  index.html
  style.css
  app.js

## Run

### 1. Backend
cd backend
python -m venv .venv

Windows:
.venv\Scripts\activate

pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload

App: http://127.0.0.1:8000
API health check: http://127.0.0.1:8000/api/health
Swagger docs: http://127.0.0.1:8000/docs

The backend serves the frontend, so no separate frontend server is required.
For frontend-only development, `python -m http.server 5500 --directory frontend`
also works; it will connect to the API on port 8000.

## PostgreSQL

Set DATABASE_URL in backend/.env:

DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5432/ryan_medicals

If DATABASE_URL is absent, the project uses SQLite:
sqlite:///./ryan_medicals.db

## FEFO example

If Paracetamol has:
- Batch A: 40 units, expires earlier
- Batch B: 100 units, expires later

A stock-out of 60 automatically consumes:
- 40 from Batch A
- 20 from Batch B

Expired batches are never selected.
