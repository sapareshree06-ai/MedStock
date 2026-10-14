from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


@app.get("/")
def root():
    return {"message": "Ryan Medicals Inventory API is running"}
