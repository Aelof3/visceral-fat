"""
MRI Analysis Service
Handles tissue segmentation and visceral fat detection
"""

import numpy as np
from PIL import Image
from pathlib import Path
from typing import Dict, Optional, List, Any
from scipy import ndimage
from skimage import measure, morphology, filters
import json

from app.config import settings
from app.services.dicom_service import DicomService


class AnalysisService:
    """Service for analyzing MRI images and detecting tissues"""
    
    def __init__(self):
        self.dicom_service = DicomService()
        self.model_service = None  # Will be set via dependency injection
        self.analysis_cache: Dict[str, Dict] = {}
    
    def set_dicom_service(self, dicom_service: DicomService):
        """Set the DICOM service reference (for dependency injection)"""
        self.dicom_service = dicom_service
    
    def set_model_service(self, model_service):
        """Set the model service reference (for clearing models on re-analysis)"""
        self.model_service = model_service
    
    def clear_all_data(self):
        """Clear all cached analysis data"""
        self.analysis_cache.clear()
    
    def clear_series_data(self, series_id: str):
        """Clear analysis data for a specific series"""
        if series_id in self.analysis_cache:
            del self.analysis_cache[series_id]
    
    def scan_existing_data(self) -> List[str]:
        """Scan for existing analysis results and load them into cache"""
        loaded_series = []
        
        if not settings.IMAGES_DIR.exists():
            return loaded_series
        
        for json_file in settings.IMAGES_DIR.glob("*_analysis.json"):
            try:
                with open(json_file, 'r') as f:
                    data = json.load(f)
                    series_id = data.get("series_id")
                    if series_id:
                        self.analysis_cache[series_id] = data
                        loaded_series.append(series_id)
            except Exception:
                continue
        
        return loaded_series
    
    async def analyze_series(self, series_id: str) -> Dict:
        """Analyze a complete DICOM series for tissue segmentation"""
        results = None
        async for progress in self.analyze_series_with_progress(series_id):
            if progress.get("type") == "complete":
                results = progress.get("data")
        return results

    async def analyze_series_with_progress(self, series_id: str):
        """Analyze a DICOM series with progress updates (generator)"""
        import asyncio
        
        series_info = self.dicom_service.get_series_info(series_id)
        if series_info is None:
            raise ValueError(f"Series not found: {series_id}")
        
        # Clear any existing 3D model for this series (it will be stale after re-analysis)
        if self.model_service is not None:
            self.model_service.clear_model_for_series(series_id)
        
        image_count = series_info["image_count"]
        
        # Send initial progress
        yield {
            "type": "start",
            "message": "Starting analysis...",
            "total_images": image_count,
            "current_image": 0,
            "progress": 0
        }
        await asyncio.sleep(0)  # Allow event to be sent
        
        results = {
            "series_id": series_id,
            "image_count": image_count,
            "analyzed_images": [],
            "tissue_stats": {
                "total_visceral_fat_volume": 0,
                "total_subcutaneous_fat_volume": 0,
                "visceral_fat_percentage": 0,
                "slice_stats": []
            }
        }
        
        total_visceral_pixels = 0
        total_subcut_pixels = 0
        total_body_pixels = 0
        
        for idx in range(image_count):
            # Send progress update
            progress_pct = round((idx / image_count) * 100)
            yield {
                "type": "progress",
                "message": f"Analyzing slice {idx + 1} of {image_count}",
                "total_images": image_count,
                "current_image": idx + 1,
                "progress": progress_pct,
                "step": "segmentation"
            }
            await asyncio.sleep(0)  # Allow event to be sent
            
            # Get pixel data in Hounsfield Units
            pixel_data = self.dicom_service.get_pixel_data(series_id, idx)
            if pixel_data is None:
                continue
            
            # Perform tissue segmentation
            segmentation = self._segment_tissues(pixel_data)
            
            # Generate color-coded image
            colored_image_path = self._generate_colored_image(
                pixel_data, segmentation, series_id, idx
            )
            
            # Calculate statistics for this slice
            visceral_pixels = np.sum(segmentation == 1)
            subcut_pixels = np.sum(segmentation == 2)
            body_pixels = np.sum(segmentation > 0)
            
            total_visceral_pixels += visceral_pixels
            total_subcut_pixels += subcut_pixels
            total_body_pixels += body_pixels
            
            slice_stats = {
                "index": idx,
                "visceral_fat_pixels": int(visceral_pixels),
                "subcutaneous_fat_pixels": int(subcut_pixels),
                "visceral_fat_area_cm2": self._pixels_to_area(visceral_pixels, series_id, idx)
            }
            
            results["analyzed_images"].append({
                "index": idx,
                "colored_image_path": colored_image_path,
                "stats": slice_stats
            })
            results["tissue_stats"]["slice_stats"].append(slice_stats)
        
        # Calculate total statistics
        yield {
            "type": "progress",
            "message": "Calculating statistics...",
            "total_images": image_count,
            "current_image": image_count,
            "progress": 95,
            "step": "statistics"
        }
        await asyncio.sleep(0)
        
        results["tissue_stats"]["total_visceral_fat_volume"] = self._pixels_to_volume(
            total_visceral_pixels, series_id
        )
        results["tissue_stats"]["total_subcutaneous_fat_volume"] = self._pixels_to_volume(
            total_subcut_pixels, series_id
        )
        
        if total_body_pixels > 0:
            results["tissue_stats"]["visceral_fat_percentage"] = round(
                (total_visceral_pixels / total_body_pixels) * 100, 2
            )
        
        # Cache results
        self.analysis_cache[series_id] = results
        
        # Save results to file
        results_path = settings.IMAGES_DIR / f"{series_id}_analysis.json"
        with open(results_path, 'w') as f:
            json.dump(results, f, indent=2)
        
        # Send completion
        yield {
            "type": "complete",
            "message": "Analysis complete!",
            "total_images": image_count,
            "current_image": image_count,
            "progress": 100,
            "data": results
        }
    
    def _segment_tissues(self, pixel_data: np.ndarray) -> np.ndarray:
        """
        Segment tissues based on MRI intensity values
        Uses adaptive thresholding since MRI doesn't have standardized units like CT
        
        In T1-weighted MRI:
        - Fat is BRIGHT (high signal intensity)
        - Organs/Muscle are MEDIUM intensity
        - Air/background is very dark
        
        Returns a labeled array:
        0 = background
        1 = visceral fat
        2 = subcutaneous fat
        3 = organs (includes muscle)
        """
        segmentation = np.zeros_like(pixel_data, dtype=np.uint8)
        
        # Normalize the data to 0-1 range
        data_min = float(np.min(pixel_data))
        data_max = float(np.max(pixel_data))
        if data_max - data_min > 0:
            normalized = (pixel_data.astype(np.float32) - data_min) / (data_max - data_min)
        else:
            return segmentation
        
        # Apply slight Gaussian smoothing to reduce noise
        normalized = ndimage.gaussian_filter(normalized, sigma=1.0)
        
        # Create body mask using Otsu threshold
        threshold = filters.threshold_otsu(normalized)
        body_mask = normalized > threshold * 0.25
        
        # Fill holes and clean up body mask
        body_mask = ndimage.binary_fill_holes(body_mask)
        body_mask = morphology.binary_opening(body_mask, morphology.disk(2))
        body_mask = morphology.binary_closing(body_mask, morphology.disk(3))
        
        # Get intensity values only within the body
        body_pixels = normalized[body_mask]
        if len(body_pixels) == 0:
            return segmentation
        
        # Calculate adaptive thresholds based on the intensity distribution
        p15 = np.percentile(body_pixels, 15)
        p75 = np.percentile(body_pixels, 75)
        
        # FAT: Brightest regions (top 25% of intensity within body)
        fat_mask = (normalized >= p75) & body_mask
        
        # Clean up fat mask - remove small isolated spots
        fat_mask = morphology.binary_opening(fat_mask, morphology.disk(2))
        fat_mask = morphology.binary_closing(fat_mask, morphology.disk(2))
        
        # Separate visceral from subcutaneous fat using distance from body edge
        eroded_body = ndimage.binary_erosion(body_mask, iterations=12)
        eroded_body = ndimage.binary_fill_holes(eroded_body)
        
        # Subcutaneous fat: fat in the outer ring (near skin)
        subcutaneous_mask = fat_mask & ~eroded_body
        
        # Visceral fat: fat in the inner abdominal region
        visceral_mask = fat_mask & eroded_body
        
        # ORGANS (includes muscle): Everything else in the body that isn't fat
        # Medium intensity regions (15th-75th percentile, excluding fat)
        organ_mask = (normalized >= p15) & (normalized < p75) & body_mask
        organ_mask = organ_mask & ~fat_mask  # Exclude fat regions
        
        # Assign labels - fat labels take priority
        segmentation[organ_mask] = 3
        segmentation[subcutaneous_mask] = 2
        segmentation[visceral_mask] = 1
        
        return segmentation
    
    def _generate_colored_image(
        self, 
        pixel_data: np.ndarray, 
        segmentation: np.ndarray, 
        series_id: str, 
        image_index: int
    ) -> str:
        """Generate a color-coded overlay image"""
        
        # Normalize pixel data for base grayscale image
        # Use percentile-based normalization for better contrast (works for both CT and MRI)
        img_min = np.percentile(pixel_data, 1)
        img_max = np.percentile(pixel_data, 99)
        if img_max - img_min < 1:
            img_max = img_min + 1
        normalized = np.clip(pixel_data, img_min, img_max)
        normalized = ((normalized - img_min) / (img_max - img_min) * 255).astype(np.uint8)
        
        # Create RGB image from grayscale
        rgb_image = np.stack([normalized] * 3, axis=-1)
        
        # Create color overlay
        overlay = np.zeros((*pixel_data.shape, 3), dtype=np.uint8)
        
        # Apply colors for each tissue type
        # 1 = visceral fat, 2 = subcutaneous fat, 3 = organs (includes muscle)
        tissue_labels = {
            1: settings.TISSUE_COLORS["visceral_fat"],
            2: settings.TISSUE_COLORS["subcutaneous_fat"],
            3: settings.TISSUE_COLORS["organ"]
        }
        
        for label, color in tissue_labels.items():
            mask = segmentation == label
            overlay[mask] = color
        
        # Blend overlay with base image (50% opacity)
        alpha = 0.5
        blended = (rgb_image * (1 - alpha) + overlay * alpha).astype(np.uint8)
        
        # Only apply color where there's segmentation
        mask = segmentation > 0
        final_image = np.where(
            np.stack([mask] * 3, axis=-1),
            blended,
            rgb_image
        )
        
        # Save the image
        output_path = settings.IMAGES_DIR / f"{series_id}_analyzed_{image_index:04d}.png"
        Image.fromarray(final_image).save(str(output_path))
        
        return str(output_path)
    
    def _pixels_to_area(self, pixel_count: int, series_id: str, image_index: int) -> float:
        """Convert pixel count to area in cm²"""
        ds = self.dicom_service.get_dataset(series_id, image_index)
        if ds is None or not hasattr(ds, 'PixelSpacing'):
            return 0.0
        
        pixel_spacing = ds.PixelSpacing  # in mm
        pixel_area_mm2 = float(pixel_spacing[0]) * float(pixel_spacing[1])
        pixel_area_cm2 = pixel_area_mm2 / 100  # Convert to cm²
        
        return round(pixel_count * pixel_area_cm2, 2)
    
    def _pixels_to_volume(self, total_pixels: int, series_id: str) -> float:
        """Convert total pixel count across slices to volume in cm³"""
        series_info = self.dicom_service.get_series_info(series_id)
        if series_info is None:
            return 0.0
        
        pixel_spacing = series_info.get("pixel_spacing")
        slice_thickness = series_info.get("slice_thickness")
        
        if pixel_spacing is None or slice_thickness is None:
            return 0.0
        
        voxel_volume_mm3 = float(pixel_spacing[0]) * float(pixel_spacing[1]) * float(slice_thickness)
        voxel_volume_cm3 = voxel_volume_mm3 / 1000  # Convert to cm³
        
        return round(total_pixels * voxel_volume_cm3, 2)
    
    def get_results(self, series_id: str) -> Optional[Dict]:
        """Get cached analysis results"""
        if series_id in self.analysis_cache:
            return self.analysis_cache[series_id]
        
        # Try to load from file
        results_path = settings.IMAGES_DIR / f"{series_id}_analysis.json"
        if results_path.exists():
            with open(results_path, 'r') as f:
                results = json.load(f)
                self.analysis_cache[series_id] = results
                return results
        
        return None
    
    def get_analyzed_image(self, series_id: str, image_index: int, overlay: bool = True) -> Optional[str]:
        """Get path to an analyzed image"""
        if overlay:
            image_path = settings.IMAGES_DIR / f"{series_id}_analyzed_{image_index:04d}.png"
        else:
            image_path = settings.IMAGES_DIR / f"{series_id}_{image_index:04d}.png"
        
        if image_path.exists():
            return str(image_path)
        
        return None
    
    def get_tissue_stats(self, series_id: str) -> Optional[Dict]:
        """Get tissue statistics for a series"""
        results = self.get_results(series_id)
        if results is None:
            return None
        
        return results.get("tissue_stats")
