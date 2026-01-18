"""
3D Model Generation Service
Creates GLB models from analyzed DICOM data
OPTIMIZED VERSION - Uses downsampling and simplified processing
"""

import numpy as np
from pathlib import Path
from typing import Dict, Optional, List, Any
import json
import trimesh
from skimage import measure
from scipy import ndimage
from scipy.ndimage import zoom

from app.config import settings
from app.services.dicom_service import DicomService
from app.services.analysis_service import AnalysisService


class ModelService:
    """Service for generating 3D models from MRI data"""
    
    def __init__(self):
        self.dicom_service = DicomService()
        self.analysis_service = AnalysisService()
        self.model_cache: Dict[str, Dict] = {}
    
    def set_services(self, dicom_service: DicomService, analysis_service: AnalysisService):
        """Set service references (for dependency injection)"""
        self.dicom_service = dicom_service
        self.analysis_service = analysis_service
    
    def clear_all_data(self):
        """Clear all cached model data"""
        self.model_cache.clear()
    
    def clear_series_data(self, series_id: str):
        """Alias for clear_model_for_series for API consistency"""
        self.clear_model_for_series(series_id)
    
    def clear_model_for_series(self, series_id: str):
        """Clear model data for a specific series"""
        # Clear from cache
        if series_id in self.model_cache:
            del self.model_cache[series_id]
        
        # Delete files from disk
        glb_path = settings.MODELS_DIR / f"{series_id}_model.glb"
        obj_path = settings.MODELS_DIR / f"{series_id}_model.obj"
        info_path = settings.MODELS_DIR / f"{series_id}_model_info.json"
        
        for path in [glb_path, obj_path, info_path]:
            if path.exists():
                try:
                    path.unlink()
                except Exception:
                    pass
    
    def scan_existing_data(self) -> List[str]:
        """Scan for existing model data and load into cache"""
        loaded_models = []
        
        if not settings.MODELS_DIR.exists():
            return loaded_models
        
        for json_file in settings.MODELS_DIR.glob("*_model_info.json"):
            try:
                with open(json_file, 'r') as f:
                    data = json.load(f)
                    series_id = data.get("series_id")
                    if series_id:
                        self.model_cache[series_id] = data
                        loaded_models.append(series_id)
            except Exception:
                continue
        
        return loaded_models
    
    async def generate_model(
        self, 
        series_id: str, 
        include_tissues: Optional[List[str]] = None
    ) -> Dict:
        """Generate a 3D model from DICOM volume data - OPTIMIZED"""
        
        # Get volume data
        volume = self.dicom_service.get_volume_data(series_id)
        if volume is None:
            raise ValueError(f"Volume data not found for series: {series_id}")
        
        # Check minimum volume requirements
        print(f"Volume shape: {volume.shape}")
        if volume.shape[0] < 3:
            raise ValueError(f"Not enough slices for 3D model (need at least 3, have {volume.shape[0]})")
        if volume.shape[1] < 10 or volume.shape[2] < 10:
            raise ValueError(f"Image dimensions too small for 3D model: {volume.shape[1]}x{volume.shape[2]}")
        
        series_info = self.dicom_service.get_series_info(series_id)
        if series_info is None:
            raise ValueError(f"Series info not found: {series_id}")
        
        # Get voxel spacing
        pixel_spacing = series_info.get("pixel_spacing", [1.0, 1.0])
        slice_thickness = series_info.get("slice_thickness", 1.0) or 1.0
        
        px_y = float(pixel_spacing[0]) if pixel_spacing else 1.0
        px_x = float(pixel_spacing[1]) if pixel_spacing else 1.0
        sl_z = float(slice_thickness) * 0.55  # Balanced for good proportions
        
        avg_pixel_spacing = (px_x + px_y) / 2
        if sl_z > avg_pixel_spacing * 1.5:
            sl_z = avg_pixel_spacing
        
        # OPTIMIZATION: Downsample volumes aggressively for browser compatibility
        downsample_factor = 1
        max_dim = max(volume.shape)
        target_max_dim = 128  # Aggressive target for browser memory limits
        if max_dim > target_max_dim:
            downsample_factor = max_dim / target_max_dim
            
            print(f"Downsampling volume by factor {downsample_factor:.1f}")
            volume = zoom(volume, 1.0 / downsample_factor, order=1)
            
            # Adjust voxel spacing for downsampling
            sl_z *= downsample_factor
            px_y *= downsample_factor
            px_x *= downsample_factor
        
        voxel_spacing = (sl_z, px_y, px_x)
        
        # Default tissues
        if include_tissues is None:
            include_tissues = ["body", "visceral_fat", "organs"]
        
        # Pre-compute normalized volume and body mask (shared across tissues)
        vol_min, vol_max = float(np.min(volume)), float(np.max(volume))
        if vol_max - vol_min > 0:
            normalized = ((volume - vol_min) / (vol_max - vol_min)).astype(np.float32)
        else:
            raise ValueError("Volume has no intensity variation")
        
        # Compute body mask once
        from skimage import filters
        threshold = filters.threshold_otsu(normalized)
        body_mask = normalized > threshold * 0.3
        body_mask = ndimage.binary_fill_holes(body_mask)
        
        # Pre-compute eroded body for fat separation
        # Use 2D erosion slice-by-slice to match 2D analysis behavior
        eroded_body = None
        if "visceral_fat" in include_tissues or "subcutaneous_fat" in include_tissues:
            # Scale erosion iterations based on downsampling
            # 2D analysis uses 12 iterations on full resolution
            # We need to scale down proportionally for downsampled volume
            scaled_iterations = max(2, int(12 / downsample_factor))
            print(f"Using {scaled_iterations} erosion iterations (scaled from 12 by factor {downsample_factor:.1f})")
            
            # Apply 2D erosion on each slice separately (like the 2D analysis does)
            eroded_body = np.zeros_like(body_mask, dtype=bool)
            for z in range(body_mask.shape[0]):
                slice_eroded = ndimage.binary_erosion(body_mask[z], iterations=scaled_iterations)
                slice_eroded = ndimage.binary_fill_holes(slice_eroded)
                eroded_body[z] = slice_eroded
            
            # Safety check: if erosion removed too much, reduce iterations
            eroded_volume_ratio = np.sum(eroded_body) / np.sum(body_mask) if np.sum(body_mask) > 0 else 0
            print(f"Eroded body volume ratio: {eroded_volume_ratio:.2%}")
            
            if eroded_volume_ratio < 0.3:  # Less than 30% of body remaining
                print("Erosion too aggressive, reducing iterations...")
                scaled_iterations = max(1, scaled_iterations // 2)
                eroded_body = np.zeros_like(body_mask, dtype=bool)
                for z in range(body_mask.shape[0]):
                    slice_eroded = ndimage.binary_erosion(body_mask[z], iterations=scaled_iterations)
                    slice_eroded = ndimage.binary_fill_holes(slice_eroded)
                    eroded_body[z] = slice_eroded
                print(f"Reduced to {scaled_iterations} iterations, new ratio: {np.sum(eroded_body) / np.sum(body_mask):.2%}")
        
        # Compute percentiles once
        body_pixels = normalized[body_mask]
        if len(body_pixels) == 0:
            raise ValueError("No body pixels found")
        
        scene = trimesh.Scene()
        model_info = {
            "series_id": series_id,
            "tissues": [],
            "slice_count": series_info.get("image_count", volume.shape[0]),
            "dimensions": list(volume.shape),
            "voxel_spacing": list(voxel_spacing)
        }
        
        # Generate meshes with improved segmentation
        # Use consistent thresholds matching the 2D analysis
        p75 = np.percentile(body_pixels, 75)
        p35 = np.percentile(body_pixels, 35)
        p55 = np.percentile(body_pixels, 55)
        
        # FAT: Brightest regions (top 25%)
        fat_mask = (normalized >= p75) & body_mask
        
        mesh_errors = []
        
        if "body" in include_tissues:
            print(f"Generating body mesh... (mask voxels: {np.sum(body_mask)})")
            mesh = self._generate_mesh_fast(body_mask, voxel_spacing, target_faces=5000)
            if mesh:
                mesh.visual.face_colors = [200, 200, 200, 255]  # Full alpha, opacity controlled by frontend
                scene.add_geometry(mesh, node_name="body", geom_name="body")
                model_info["tissues"].append({"name": "body", "color": "#C8C8C8", "opacity": 0.35})
                print(f"  Body mesh: {len(mesh.faces)} faces")
            else:
                mesh_errors.append("body (no valid geometry)")
        
        if "visceral_fat" in include_tissues:
            # Visceral fat: bright fat in the inner abdominal region
            tissue_mask = fat_mask.copy()
            if eroded_body is not None:
                tissue_mask = tissue_mask & eroded_body
            print(f"Generating visceral_fat mesh... (mask voxels: {np.sum(tissue_mask)})")
            # keep_small_objects=True to preserve distributed fat deposits
            mesh = self._generate_mesh_fast(tissue_mask, voxel_spacing, target_faces=8000, keep_small_objects=True)
            if mesh:
                mesh.visual.face_colors = [255, 165, 0, 255]  # Full alpha
                scene.add_geometry(mesh, node_name="visceral_fat", geom_name="visceral_fat")
                model_info["tissues"].append({"name": "visceral_fat", "color": "#FFA500", "opacity": 1.0})
                print(f"  Visceral fat mesh: {len(mesh.faces)} faces")
            else:
                mesh_errors.append("visceral_fat (no valid geometry)")
        
        if "subcutaneous_fat" in include_tissues:
            # Subcutaneous fat: bright fat in the outer ring (near skin)
            tissue_mask = fat_mask.copy()
            if eroded_body is not None:
                tissue_mask = tissue_mask & ~eroded_body
            print(f"Generating subcutaneous_fat mesh... (mask voxels: {np.sum(tissue_mask)})")
            # keep_small_objects=True to preserve distributed fat deposits
            mesh = self._generate_mesh_fast(tissue_mask, voxel_spacing, target_faces=8000, keep_small_objects=True)
            if mesh:
                mesh.visual.face_colors = [255, 255, 0, 255]  # Full alpha
                scene.add_geometry(mesh, node_name="subcutaneous_fat", geom_name="subcutaneous_fat")
                model_info["tissues"].append({"name": "subcutaneous_fat", "color": "#FFFF00", "opacity": 1.0})
                print(f"  Subcutaneous fat mesh: {len(mesh.faces)} faces")
            else:
                mesh_errors.append("subcutaneous_fat (no valid geometry)")
        
        if "organs" in include_tissues:
            # Organs (includes muscle): everything in the body that isn't fat
            # Medium intensity regions (15th-75th percentile)
            p15 = np.percentile(body_pixels, 15)
            tissue_mask = (normalized >= p15) & (normalized < p75) & body_mask
            tissue_mask = tissue_mask & ~fat_mask  # Exclude fat
            print(f"Generating organs mesh... (mask voxels: {np.sum(tissue_mask)})")
            mesh = self._generate_mesh_fast(tissue_mask, voxel_spacing, target_faces=8000)
            if mesh:
                mesh.visual.face_colors = [0, 128, 255, 255]  # Full alpha
                scene.add_geometry(mesh, node_name="organs", geom_name="organs")
                model_info["tissues"].append({"name": "organs", "color": "#0080FF", "opacity": 1.0})
                print(f"  Organs mesh: {len(mesh.faces)} faces")
            else:
                mesh_errors.append("organs (no valid geometry)")
        
        if len(scene.geometry) == 0:
            error_detail = ", ".join(mesh_errors) if mesh_errors else "unknown reason"
            raise ValueError(f"No meshes could be generated. Failed tissues: {error_detail}")
        
        # Export to GLB only (faster, skip OBJ)
        glb_path = settings.MODELS_DIR / f"{series_id}_model.glb"
        try:
            scene.export(str(glb_path), file_type='glb')
        except Exception as e:
            print(f"GLB export failed: {e}")
        
        model_info["glb_path"] = str(glb_path) if glb_path.exists() else None
        model_info["obj_path"] = None  # Skip OBJ for speed
        
        info_path = settings.MODELS_DIR / f"{series_id}_model_info.json"
        with open(info_path, 'w') as f:
            json.dump(model_info, f)
        
        self.model_cache[series_id] = model_info
        return model_info
    
    def _generate_mesh_fast(
        self, 
        mask: np.ndarray, 
        voxel_spacing: tuple,
        target_faces: int = 10000,
        keep_small_objects: bool = False
    ) -> Optional[trimesh.Trimesh]:
        """Mesh generation optimized for clean, smooth appearance"""
        try:
            total_voxels = np.sum(mask)
            if total_voxels < 10:  # Need at least 10 voxels
                print(f"  Skipping: only {total_voxels} voxels in mask")
                return None
            
            # Step 1: Clean up the mask with morphological operations
            # Use lighter cleanup for fat tissues to preserve detail
            opening_iters = 1 if total_voxels > 2000 else 0
            closing_iters = 1  # Reduced from 2 to preserve more detail
            
            if opening_iters > 0:
                mask = ndimage.binary_opening(mask, iterations=opening_iters)
            
            # Fill small holes
            if closing_iters > 0:
                mask = ndimage.binary_closing(mask, iterations=closing_iters)
            mask = ndimage.binary_fill_holes(mask)
            
            # Remove small disconnected objects (keep only larger regions)
            # Less aggressive for fat tissues (keep_small_objects=True)
            if not keep_small_objects:
                labeled, num_features = ndimage.label(mask)
                if num_features > 1:
                    sizes = ndimage.sum(mask, labeled, range(1, num_features + 1))
                    # Keep only objects larger than 0.5% of the largest (or 10 voxels minimum)
                    max_size = np.max(sizes) if len(sizes) > 0 else 0
                    min_size = max(10, max_size * 0.005)  # Reduced thresholds
                    for i, size in enumerate(sizes, 1):
                        if size < min_size:
                            mask[labeled == i] = False
            
            remaining_voxels = np.sum(mask)
            if remaining_voxels < 10:
                print(f"  Skipping after cleanup: only {remaining_voxels} voxels remain")
                return None
            
            # Step 2: Apply Gaussian smoothing to create smoother surfaces
            # Convert to float and smooth
            smoothed = ndimage.gaussian_filter(mask.astype(np.float32), sigma=1.2)
            
            # Step 3: Run marching cubes on the smoothed volume
            verts, faces, normals, _ = measure.marching_cubes(
                smoothed,
                level=0.5,
                spacing=voxel_spacing,
                step_size=1  # Full resolution for smoother surface
            )
            
            if len(faces) == 0:
                return None
            
            mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals)
            
            # Step 4: Smooth the mesh vertices (Laplacian smoothing)
            try:
                # Apply Laplacian smoothing for even smoother appearance
                trimesh.smoothing.filter_laplacian(mesh, iterations=2)
            except Exception:
                pass  # Continue without smoothing if it fails
            
            # Step 5: Simplify to target face count
            if len(mesh.faces) > target_faces:
                try:
                    mesh = mesh.simplify_quadric_decimation(target_faces)
                except Exception as e:
                    print(f"Simplification failed: {e}")
            
            return mesh
        except Exception as e:
            print(f"Mesh generation failed: {e}")
            return None
    
    def get_model_path(self, series_id: str, format: str = "glb") -> Optional[str]:
        """Get the path to a generated model"""
        if format == "glb":
            model_path = settings.MODELS_DIR / f"{series_id}_model.glb"
        elif format == "obj":
            model_path = settings.MODELS_DIR / f"{series_id}_model.obj"
        else:
            return None
        
        if model_path.exists():
            return str(model_path)
        return None
    
    def get_model_info(self, series_id: str) -> Optional[Dict]:
        """Get information about a generated model"""
        if series_id in self.model_cache:
            return self.model_cache[series_id]
        
        info_path = settings.MODELS_DIR / f"{series_id}_model_info.json"
        if info_path.exists():
            with open(info_path, 'r') as f:
                info = json.load(f)
                self.model_cache[series_id] = info
                return info
        return None
    
    def get_slice_plane(self, series_id: str, slice_index: int) -> Optional[Dict]:
        """Get the 3D coordinates for a slice plane"""
        model_info = self.get_model_info(series_id)
        if model_info is None:
            return None
        
        slice_count = model_info.get("slice_count", 0)
        voxel_spacing = model_info.get("voxel_spacing", [1, 1, 1])
        dimensions = model_info.get("dimensions", [0, 0, 0])
        
        if slice_index < 0 or slice_index >= slice_count:
            return None
        
        z_position = slice_index * voxel_spacing[0]
        width = dimensions[2] * voxel_spacing[2]
        height = dimensions[1] * voxel_spacing[1]
        
        return {
            "slice_index": slice_index,
            "z_position": z_position,
            "width": width,
            "height": height,
            "center": [width / 2, height / 2, z_position],
            "normal": [0, 0, 1]
        }
    
    def list_models(self) -> List[Dict]:
        """List all generated models"""
        models = []
        
        for info_file in settings.MODELS_DIR.glob("*_model_info.json"):
            with open(info_file, 'r') as f:
                info = json.load(f)
                models.append({
                    "series_id": info.get("series_id"),
                    "tissues": [t["name"] for t in info.get("tissues", [])],
                    "slice_count": info.get("slice_count", 0)
                })
        
        return models
