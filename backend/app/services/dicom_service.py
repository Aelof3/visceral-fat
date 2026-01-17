"""
DICOM Processing Service
Handles loading, parsing, and converting DICOM files
"""

import os
import pydicom
import numpy as np
from PIL import Image
from pathlib import Path
from typing import List, Dict, Optional, Any
import aiofiles
import hashlib

from app.config import settings


class DicomService:
    """Service for handling DICOM file operations"""
    
    def __init__(self):
        self.dicom_cache: Dict[str, Any] = {}
        self.series_data: Dict[str, List[pydicom.Dataset]] = {}
    
    def clear_all_data(self):
        """Clear all cached DICOM data"""
        self.dicom_cache.clear()
        self.series_data.clear()
    
    def scan_existing_data(self) -> List[Dict]:
        """Scan the DICOM directory for existing extracted data and load it"""
        results = []
        
        # Clear existing data first to prevent duplicates on refresh
        self.dicom_cache.clear()
        self.series_data.clear()
        
        # Look for extracted upload directories
        if not settings.DICOM_DIR.exists():
            return results
        
        for item in settings.DICOM_DIR.iterdir():
            if item.is_dir() and item.name.startswith('upload_'):
                # This is an extracted upload directory, load it
                try:
                    loaded = self.load_from_directory(str(item))
                    results.extend(loaded)
                except Exception:
                    continue
        
        return results
    
    async def process_uploaded_files(self, files) -> List[Dict]:
        """Process uploaded DICOM files"""
        results = []
        
        for file in files:
            # Generate unique filename
            content = await file.read()
            file_hash = hashlib.md5(content).hexdigest()[:8]
            filename = f"{file_hash}_{file.filename}"
            file_path = settings.DICOM_DIR / filename
            
            # Save file
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(content)
            
            # Parse DICOM
            try:
                ds = pydicom.dcmread(str(file_path))
                series_uid = str(ds.SeriesInstanceUID) if hasattr(ds, 'SeriesInstanceUID') else file_hash
                
                # Cache the dataset
                if series_uid not in self.series_data:
                    self.series_data[series_uid] = []
                self.series_data[series_uid].append(ds)
                
                results.append({
                    "filename": filename,
                    "series_uid": series_uid,
                    "instance_number": int(ds.InstanceNumber) if hasattr(ds, 'InstanceNumber') else 0,
                    "modality": str(ds.Modality) if hasattr(ds, 'Modality') else "Unknown"
                })
            except Exception as e:
                results.append({
                    "filename": filename,
                    "error": str(e)
                })
        
        return results
    
    def load_from_directory(self, directory_path: str) -> List[Dict]:
        """Load DICOM files from a local directory"""
        results = []
        dir_path = Path(directory_path)
        
        if not dir_path.exists():
            raise ValueError(f"Directory not found: {directory_path}")
        
        # Find all DICOM files (files without extension or .dcm)
        dicom_files = []
        for root, dirs, files in os.walk(dir_path):
            for file in files:
                if not file.endswith('.zip'):  # Skip zip files
                    file_path = Path(root) / file
                    dicom_files.append(file_path)
        
        # Process each file
        for file_path in sorted(dicom_files):
            try:
                ds = pydicom.dcmread(str(file_path))
                series_uid = str(ds.SeriesInstanceUID) if hasattr(ds, 'SeriesInstanceUID') else file_path.stem
                
                if series_uid not in self.series_data:
                    self.series_data[series_uid] = []
                self.series_data[series_uid].append(ds)
                
            except Exception:
                continue  # Skip non-DICOM files
        
        # Sort each series by instance number
        for series_uid in self.series_data:
            self.series_data[series_uid].sort(
                key=lambda x: int(x.InstanceNumber) if hasattr(x, 'InstanceNumber') else 0
            )
        
        # Return series information
        series_index = 1
        for series_uid, datasets in self.series_data.items():
            if datasets:
                ds = datasets[0]
                
                # Get series description, handling empty strings
                series_desc = ""
                if hasattr(ds, 'SeriesDescription') and ds.SeriesDescription:
                    series_desc = str(ds.SeriesDescription).strip()
                
                # Get modality
                modality = str(ds.Modality) if hasattr(ds, 'Modality') and ds.Modality else "Unknown"
                
                # Build a meaningful name if description is empty
                if not series_desc:
                    series_desc = f"{modality} Series {series_index}"
                
                results.append({
                    "series_uid": series_uid,
                    "series_description": series_desc,
                    "modality": modality,
                    "image_count": len(datasets),
                    "patient_name": str(ds.PatientName) if hasattr(ds, 'PatientName') and ds.PatientName else "Unknown"
                })
                series_index += 1
        
        return results
    
    def list_available_series(self) -> List[Dict]:
        """List all loaded DICOM series"""
        results = []
        
        series_index = 1
        for series_uid, datasets in self.series_data.items():
            if datasets:
                ds = datasets[0]
                
                # Get series description, handling empty strings
                series_desc = ""
                if hasattr(ds, 'SeriesDescription') and ds.SeriesDescription:
                    series_desc = str(ds.SeriesDescription).strip()
                
                # Get modality
                modality = str(ds.Modality) if hasattr(ds, 'Modality') and ds.Modality else "Unknown"
                
                # Build a meaningful name if description is empty
                if not series_desc:
                    series_desc = f"{modality} Series {series_index}"
                
                results.append({
                    "series_uid": series_uid,
                    "series_description": series_desc,
                    "modality": modality,
                    "image_count": len(datasets)
                })
                series_index += 1
        
        return results
    
    def get_series_info(self, series_id: str) -> Optional[Dict]:
        """Get detailed information about a series"""
        if series_id not in self.series_data:
            return None
        
        datasets = self.series_data[series_id]
        if not datasets:
            return None
        
        ds = datasets[0]
        
        return {
            "series_uid": series_id,
            "series_description": str(ds.SeriesDescription) if hasattr(ds, 'SeriesDescription') else "Unknown",
            "modality": str(ds.Modality) if hasattr(ds, 'Modality') else "Unknown",
            "patient_name": str(ds.PatientName) if hasattr(ds, 'PatientName') else "Unknown",
            "study_date": str(ds.StudyDate) if hasattr(ds, 'StudyDate') else "Unknown",
            "image_count": len(datasets),
            "rows": int(ds.Rows) if hasattr(ds, 'Rows') else 0,
            "columns": int(ds.Columns) if hasattr(ds, 'Columns') else 0,
            "pixel_spacing": list(ds.PixelSpacing) if hasattr(ds, 'PixelSpacing') else None,
            "slice_thickness": float(ds.SliceThickness) if hasattr(ds, 'SliceThickness') else None
        }
    
    def get_series_images(self, series_id: str) -> List[Dict]:
        """Get list of images in a series"""
        if series_id not in self.series_data:
            return []
        
        images = []
        for idx, ds in enumerate(self.series_data[series_id]):
            images.append({
                "index": idx,
                "instance_number": int(ds.InstanceNumber) if hasattr(ds, 'InstanceNumber') else idx,
                "slice_location": float(ds.SliceLocation) if hasattr(ds, 'SliceLocation') else None
            })
        
        return images
    
    def get_image_as_png(self, series_id: str, image_index: int) -> Optional[str]:
        """Convert a DICOM image to PNG and return the path"""
        if series_id not in self.series_data:
            return None
        
        datasets = self.series_data[series_id]
        if image_index < 0 or image_index >= len(datasets):
            return None
        
        ds = datasets[image_index]
        
        # Get pixel array
        pixel_array = ds.pixel_array.astype(float)
        
        # Apply rescale slope and intercept if available
        if hasattr(ds, 'RescaleSlope') and hasattr(ds, 'RescaleIntercept'):
            pixel_array = pixel_array * ds.RescaleSlope + ds.RescaleIntercept
        
        # Window/level adjustment for visualization
        if hasattr(ds, 'WindowCenter') and hasattr(ds, 'WindowWidth'):
            wc = ds.WindowCenter
            ww = ds.WindowWidth
            if isinstance(wc, pydicom.multival.MultiValue):
                wc = wc[0]
            if isinstance(ww, pydicom.multival.MultiValue):
                ww = ww[0]
        else:
            # Default abdominal window
            wc = 40
            ww = 400
        
        # Apply window/level
        img_min = wc - ww / 2
        img_max = wc + ww / 2
        pixel_array = np.clip(pixel_array, img_min, img_max)
        pixel_array = ((pixel_array - img_min) / (img_max - img_min) * 255).astype(np.uint8)
        
        # Save as PNG
        output_path = settings.IMAGES_DIR / f"{series_id}_{image_index:04d}.png"
        Image.fromarray(pixel_array).save(str(output_path))
        
        return str(output_path)
    
    def get_pixel_data(self, series_id: str, image_index: int) -> Optional[np.ndarray]:
        """Get the raw pixel data with HU values for analysis"""
        if series_id not in self.series_data:
            return None
        
        datasets = self.series_data[series_id]
        if image_index < 0 or image_index >= len(datasets):
            return None
        
        ds = datasets[image_index]
        pixel_array = ds.pixel_array.astype(float)
        
        # Convert to Hounsfield Units
        if hasattr(ds, 'RescaleSlope') and hasattr(ds, 'RescaleIntercept'):
            pixel_array = pixel_array * ds.RescaleSlope + ds.RescaleIntercept
        
        return pixel_array
    
    def get_volume_data(self, series_id: str) -> Optional[np.ndarray]:
        """Get the full 3D volume data for a series"""
        if series_id not in self.series_data:
            return None
        
        datasets = self.series_data[series_id]
        if not datasets:
            return None
        
        # First pass: collect all slices and their dimensions
        slice_data = []
        dimension_counts = {}
        
        for ds in datasets:
            try:
                pixel_array = ds.pixel_array.astype(float)
                if hasattr(ds, 'RescaleSlope') and hasattr(ds, 'RescaleIntercept'):
                    pixel_array = pixel_array * ds.RescaleSlope + ds.RescaleIntercept
                
                dims = pixel_array.shape
                slice_data.append((pixel_array, dims))
                
                # Count occurrences of each dimension
                if dims not in dimension_counts:
                    dimension_counts[dims] = 0
                dimension_counts[dims] += 1
            except Exception as e:
                print(f"Warning: Could not read slice: {e}")
                continue
        
        if not slice_data:
            return None
        
        # Find the most common dimension (majority)
        majority_dims = max(dimension_counts.keys(), key=lambda d: dimension_counts[d])
        majority_count = dimension_counts[majority_dims]
        total_count = len(slice_data)
        
        # Filter to only include slices with majority dimensions
        filtered_slices = [s[0] for s in slice_data if s[1] == majority_dims]
        
        if len(filtered_slices) < total_count:
            excluded = total_count - len(filtered_slices)
            print(f"Volume assembly: Using {len(filtered_slices)}/{total_count} slices "
                  f"(excluded {excluded} slices with non-standard dimensions). "
                  f"Majority dims: {majority_dims}")
        
        if not filtered_slices:
            return None
        
        return np.stack(filtered_slices, axis=0)
    
    def get_dataset(self, series_id: str, image_index: int) -> Optional[pydicom.Dataset]:
        """Get a specific DICOM dataset"""
        if series_id not in self.series_data:
            return None
        
        datasets = self.series_data[series_id]
        if image_index < 0 or image_index >= len(datasets):
            return None
        
        return datasets[image_index]
