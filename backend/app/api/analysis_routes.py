"""
MRI Analysis API routes
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from typing import Optional
import json
import asyncio

from app.services.shared import analysis_service
from app.models.schemas import AnalysisResult, TissueStats

router = APIRouter()


@router.post("/analyze/{series_id}")
async def analyze_series(series_id: str):
    """
    Analyze a DICOM series for visceral fat and tissue segmentation (non-streaming)
    """
    try:
        result = await analysis_service.analyze_series(series_id)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyze-stream/{series_id}")
async def analyze_series_stream(series_id: str):
    """
    Analyze a DICOM series with streaming progress updates (SSE)
    """
    async def event_generator():
        try:
            async for progress in analysis_service.analyze_series_with_progress(series_id):
                yield f"data: {json.dumps(progress)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.get("/results/{series_id}")
async def get_analysis_results(series_id: str):
    """
    Get cached analysis results for a series
    """
    try:
        results = analysis_service.get_results(series_id)
        if results is None:
            raise HTTPException(status_code=404, detail="Analysis results not found")
        return {"status": "success", "data": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{series_id}/image/{image_index}")
async def get_analyzed_image(series_id: str, image_index: int, overlay: bool = True):
    """
    Get an analyzed/color-coded image
    """
    try:
        image_path = analysis_service.get_analyzed_image(series_id, image_index, overlay)
        if image_path is None:
            raise HTTPException(status_code=404, detail="Analyzed image not found")
        return FileResponse(image_path, media_type="image/png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{series_id}/stats")
async def get_tissue_statistics(series_id: str):
    """
    Get tissue statistics for an analyzed series
    """
    try:
        stats = analysis_service.get_tissue_stats(series_id)
        if stats is None:
            raise HTTPException(status_code=404, detail="Statistics not found")
        return {"status": "success", "data": stats}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{series_id}/legend")
async def get_color_legend():
    """
    Get the color legend for tissue types
    """
    return {
        "status": "success",
        "legend": {
            "visceral_fat": {"color": "#FFA500", "description": "Visceral Fat"},
            "subcutaneous_fat": {"color": "#FFFF00", "description": "Subcutaneous Fat"},
            "muscle": {"color": "#FF0000", "description": "Muscle Tissue"},
            "organ": {"color": "#0080FF", "description": "Organs"},
            "bone": {"color": "#FFFFFF", "description": "Bone"},
            "background": {"color": "#000000", "description": "Background"}
        }
    }
