import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import health, picking

app = FastAPI(
    title="WMS 피킹 생산성 API",
    description="양지1센터 피킹 생산성 지표 조회 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(picking.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "WMS 피킹 생산성 API", "docs": "/docs"}
