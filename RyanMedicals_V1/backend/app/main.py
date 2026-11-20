from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import Base, engine
from .routers import medicines, stock, dashboard

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Ryan Medicals Inventory API",
    version="1.0.0",
    description="Core batch-aware pharmacy inventory management API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(medicines.router)
app.include_router(stock.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"message": "Ryan Medicals Inventory API is running"}


# Serve the modular frontend from the same origin as the API. This keeps the
# application usable with one server command while CORS still supports local
# frontend development on a separate port.
frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
