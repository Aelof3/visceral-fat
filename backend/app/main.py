"""
Visceral Fat MRI Analysis - FastAPI Backend
Main application entry point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path

from app.api import dicom_routes, analysis_routes, model_routes
from app.config import settings

app = FastAPI(
    title="Visceral Fat MRI Analysis API",
    description="API for analyzing MRI images, detecting visceral fat, and generating 3D models",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving generated assets
assets_path = Path(__file__).parent.parent.parent / "assets"
if assets_path.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")

# Include routers
app.include_router(dicom_routes.router, prefix="/api/dicom", tags=["DICOM"])
app.include_router(analysis_routes.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(model_routes.router, prefix="/api/model", tags=["3D Model"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "healthy", "message": "Visceral Fat MRI Analysis API"}


@app.get("/health")
async def health():
    """Simple health check for Electron"""
    return {"status": "healthy"}


@app.get("/api/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "services": {
            "dicom_processing": "active",
            "analysis": "active",
            "model_generation": "active"
        }
    }
