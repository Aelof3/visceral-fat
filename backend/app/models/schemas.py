"""
Pydantic schemas for API request/response models
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class DicomInfo(BaseModel):
    """Information about a single DICOM file"""
    filename: str
    series_uid: str
    instance_number: int
    modality: str
    error: Optional[str] = None


class DicomSeries(BaseModel):
    """Information about a DICOM series"""
    series_uid: str
    series_description: str
    modality: str
    image_count: int
    patient_name: Optional[str] = None
    study_date: Optional[str] = None
    rows: Optional[int] = None
    columns: Optional[int] = None
    pixel_spacing: Optional[List[float]] = None
    slice_thickness: Optional[float] = None


class SliceStats(BaseModel):
    """Statistics for a single slice"""
    index: int
    visceral_fat_pixels: int
    subcutaneous_fat_pixels: int
    visceral_fat_area_cm2: float


class TissueStats(BaseModel):
    """Overall tissue statistics"""
    total_visceral_fat_volume: float
    total_subcutaneous_fat_volume: float
    visceral_fat_percentage: float
    slice_stats: List[SliceStats]


class AnalyzedImage(BaseModel):
    """Information about an analyzed image"""
    index: int
    colored_image_path: str
    stats: SliceStats


class AnalysisResult(BaseModel):
    """Complete analysis results"""
    series_id: str
    image_count: int
    analyzed_images: List[AnalyzedImage]
    tissue_stats: TissueStats


class ModelGenerationRequest(BaseModel):
    """Request to generate a 3D model"""
    series_id: str
    include_tissues: Optional[List[str]] = None


class TissueInfo(BaseModel):
    """Information about a tissue in the model"""
    name: str
    color: str
    opacity: float


class ModelInfo(BaseModel):
    """Information about a generated 3D model"""
    series_id: str
    tissues: List[TissueInfo]
    slice_count: int
    dimensions: List[int]
    voxel_spacing: List[float]
    glb_path: Optional[str] = None
    obj_path: Optional[str] = None


class SlicePlane(BaseModel):
    """Information about a slice plane in 3D space"""
    slice_index: int
    z_position: float
    width: float
    height: float
    center: List[float]
    normal: List[float]


class ColorLegendItem(BaseModel):
    """Color legend item"""
    color: str
    description: str


class ColorLegend(BaseModel):
    """Complete color legend"""
    visceral_fat: ColorLegendItem
    subcutaneous_fat: ColorLegendItem
    muscle: ColorLegendItem
    organ: ColorLegendItem
    bone: ColorLegendItem
    background: ColorLegendItem
