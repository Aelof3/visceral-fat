"""
3D Model Generation API routes
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from typing import Optional, Dict
import asyncio
from concurrent.futures import ThreadPoolExecutor
import traceback

from app.services.shared import model_service
from app.models.schemas import ModelGenerationRequest, ModelInfo

router = APIRouter()

# Thread pool for CPU-intensive model generation
executor = ThreadPoolExecutor(max_workers=2)

# Track generation status
generation_status: Dict[str, dict] = {}


def _generate_model_sync(series_id: str, include_tissues: Optional[list] = None):
    """Synchronous model generation wrapper for thread pool"""
    try:
        generation_status[series_id] = {
            "status": "generating",
            "progress": 0,
            "message": "Starting model generation..."
        }
        
        # Run the async function in a new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                model_service.generate_model(series_id, include_tissues)
            )
            generation_status[series_id] = {
                "status": "complete",
                "progress": 100,
                "message": "Model generation complete!",
                "data": result
            }
            return result
        finally:
            loop.close()
    except Exception as e:
        generation_status[series_id] = {
            "status": "error",
            "progress": 0,
            "message": str(e),
            "error": traceback.format_exc()
        }
        raise


@router.post("/generate/{series_id}")
async def generate_3d_model(series_id: str, include_tissues: Optional[list] = None):
    """
    Generate a 3D model from an analyzed DICOM series (runs in background)
    """
    try:
        # Check if already generating
        if series_id in generation_status:
            status = generation_status[series_id]
            if status.get("status") == "generating":
                return {
                    "status": "already_generating",
                    "message": "Model generation already in progress"
                }
        
        # Start generation in thread pool
        generation_status[series_id] = {
            "status": "generating",
            "progress": 0,
            "message": "Initializing..."
        }
        
        # Run in background thread
        loop = asyncio.get_event_loop()
        loop.run_in_executor(executor, _generate_model_sync, series_id, include_tissues)
        
        return {
            "status": "started",
            "message": "Model generation started in background"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Model generation error: {error_detail}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/generate/{series_id}/status")
async def get_generation_status(series_id: str):
    """
    Get the status of a model generation task
    """
    if series_id not in generation_status:
        # Check if model already exists
        info = model_service.get_model_info(series_id)
        if info:
            return {
                "status": "complete",
                "progress": 100,
                "message": "Model already exists",
                "data": info
            }
        return {
            "status": "not_started",
            "progress": 0,
            "message": "No generation task found"
        }
    
    return generation_status[series_id]


@router.get("/download/{series_id}")
async def download_model(series_id: str, format: str = "glb"):
    """
    Download the generated 3D model
    """
    try:
        model_path = model_service.get_model_path(series_id, format)
        if model_path is None:
            raise HTTPException(status_code=404, detail="Model not found")
        
        media_type = "model/gltf-binary" if format == "glb" else "application/octet-stream"
        return FileResponse(
            model_path, 
            media_type=media_type,
            filename=f"{series_id}_model.{format}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info/{series_id}")
async def get_model_info(series_id: str):
    """
    Get information about a generated model
    """
    try:
        info = model_service.get_model_info(series_id)
        if info is None:
            raise HTTPException(status_code=404, detail="Model info not found")
        return {"status": "success", "data": info}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/slice/{series_id}/{slice_index}")
async def get_slice_plane(series_id: str, slice_index: int):
    """
    Get the plane coordinates for a specific slice in the 3D model
    """
    try:
        plane_data = model_service.get_slice_plane(series_id, slice_index)
        if plane_data is None:
            raise HTTPException(status_code=404, detail="Slice plane not found")
        return {"status": "success", "data": plane_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_generated_models():
    """
    List all generated 3D models
    """
    try:
        models = model_service.list_models()
        return {"status": "success", "models": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
