"""
DICOM processing API routes
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from typing import List
import os
from pathlib import Path
import zipfile
import tempfile
import shutil

from app.services.shared import dicom_service, analysis_service, model_service
from app.models.schemas import DicomInfo, DicomSeries
from app.config import settings

router = APIRouter()


@router.get("/init")
async def initialize_existing_data():
    """
    Scan for and load any existing DICOM data, analysis results, and models
    """
    try:
        # Scan for existing DICOM data
        series = dicom_service.scan_existing_data()
        
        # Scan for existing analysis results
        analyzed_series = analysis_service.scan_existing_data()
        
        # Scan for existing models
        model_series = model_service.scan_existing_data()
        
        return {
            "status": "success",
            "series": series,
            "analyzed_series": analyzed_series,
            "model_series": model_series
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clear-results")
async def clear_analysis_and_models():
    """
    Clear all analysis results and 3D models, but keep uploaded DICOM images
    """
    try:
        # Clear analysis cache
        analysis_service.clear_all_data()
        
        # Clear model cache
        model_service.clear_all_data()
        
        # Delete analysis JSON files from images dir (colored images are kept)
        if settings.IMAGES_DIR.exists():
            for f in settings.IMAGES_DIR.glob("*_analysis.json"):
                if f.is_file():
                    f.unlink()
            # Also delete colored/analyzed images
            for f in settings.IMAGES_DIR.glob("*_colored.png"):
                if f.is_file():
                    f.unlink()
        
        # Delete model files from disk
        if settings.MODELS_DIR.exists():
            for f in settings.MODELS_DIR.glob("*"):
                if f.is_file():
                    f.unlink()
        
        return {
            "status": "success",
            "message": "Analysis results and 3D models cleared successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/series/{series_uid}/clear-results")
async def clear_series_analysis_and_model(series_uid: str):
    """
    Clear analysis results and 3D model for a specific series, but keep DICOM images
    """
    try:
        # Clear from analysis cache
        analysis_service.clear_series_data(series_uid)
        
        # Clear from model cache
        model_service.clear_series_data(series_uid)
        
        # Delete analysis files for this series
        if settings.IMAGES_DIR.exists():
            # Delete analysis JSON
            analysis_json = settings.IMAGES_DIR / f"{series_uid}_analysis.json"
            if analysis_json.exists():
                analysis_json.unlink()
            # Delete colored images for this series
            for f in settings.IMAGES_DIR.glob(f"{series_uid}_*_colored.png"):
                if f.is_file():
                    f.unlink()
        
        # Delete model files for this series
        if settings.MODELS_DIR.exists():
            model_glb = settings.MODELS_DIR / f"{series_uid}.glb"
            if model_glb.exists():
                model_glb.unlink()
            model_json = settings.MODELS_DIR / f"{series_uid}_info.json"
            if model_json.exists():
                model_json.unlink()
        
        return {
            "status": "success",
            "message": f"Analysis and 3D model cleared for series {series_uid}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_dicom_files(files: List[UploadFile] = File(...)):
    """
    Upload DICOM files for processing
    """
    try:
        results = await dicom_service.process_uploaded_files(files)
        return {"status": "success", "files_processed": len(results), "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-zip")
async def upload_zip_file(file: UploadFile = File(...)):
    """
    Upload a ZIP file containing DICOM files for processing
    """
    if not file.filename.lower().endswith('.zip'):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")
    
    try:
        # Clear all existing data before processing new upload
        dicom_service.clear_all_data()
        analysis_service.clear_all_data()
        model_service.clear_all_data()
        
        # Create a temporary directory to extract the zip
        extract_dir = settings.DICOM_DIR / f"upload_{file.filename.replace('.zip', '')}"
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        # Save and extract the zip file
        zip_path = settings.DICOM_DIR / file.filename
        content = await file.read()
        
        with open(zip_path, 'wb') as f:
            f.write(content)
        
        # Extract the zip file
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # Remove the zip file after extraction
        os.remove(zip_path)
        
        # Load DICOM files from the extracted directory
        results = dicom_service.load_from_directory(str(extract_dir))
        
        return {
            "status": "success", 
            "series_loaded": len(results), 
            "data": results,
            "message": f"Extracted and loaded {len(results)} series from {file.filename}"
        }
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/series")
async def list_dicom_series():
    """
    List all available DICOM series
    """
    try:
        series = dicom_service.list_available_series()
        return {"status": "success", "series": series}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/series/{series_id}")
async def get_series_info(series_id: str):
    """
    Get detailed information about a DICOM series
    """
    try:
        info = dicom_service.get_series_info(series_id)
        if info is None:
            raise HTTPException(status_code=404, detail="Series not found")
        return {"status": "success", "data": info}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/series/{series_id}/images")
async def get_series_images(series_id: str):
    """
    Get list of images in a DICOM series
    """
    try:
        images = dicom_service.get_series_images(series_id)
        return {"status": "success", "images": images}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/series/{series_id}/image/{image_index}")
async def get_dicom_image(series_id: str, image_index: int):
    """
    Get a specific DICOM image as PNG
    """
    try:
        image_path = dicom_service.get_image_as_png(series_id, image_index)
        if image_path is None:
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(image_path, media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/load-directory")
async def load_dicom_directory(directory_path: str):
    """
    Load DICOM files from a local directory
    """
    try:
        results = dicom_service.load_from_directory(directory_path)
        return {"status": "success", "series_loaded": len(results), "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
