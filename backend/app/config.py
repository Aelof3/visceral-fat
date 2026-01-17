"""
Application configuration settings
"""

from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path


class Settings(BaseSettings):
    """Application settings"""
    
    # API Settings
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = True
    
    # CORS Settings
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173", 
        "http://localhost:5174",
        "http://localhost:3000", 
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000"
    ]
    
    # File Paths
    BASE_DIR: Path = Path(__file__).parent.parent.parent
    ASSETS_DIR: Path = BASE_DIR / "assets"
    DICOM_DIR: Path = ASSETS_DIR / "dicom"
    IMAGES_DIR: Path = ASSETS_DIR / "images"
    MODELS_DIR: Path = ASSETS_DIR / "models"
    ANALYSIS_DIR: Path = ASSETS_DIR / "analysis"
    
    # Analysis Settings
    VISCERAL_FAT_HU_MIN: int = -190  # Hounsfield units for fat tissue (lower bound)
    VISCERAL_FAT_HU_MAX: int = -30   # Hounsfield units for fat tissue (upper bound)
    
    # Color coding for different tissue types (RGB)
    TISSUE_COLORS: dict = {
        "visceral_fat": [255, 165, 0],    # Orange
        "subcutaneous_fat": [255, 255, 0], # Yellow
        "muscle": [255, 0, 0],             # Red
        "organ": [0, 128, 255],            # Blue
        "bone": [255, 255, 255],           # White
        "background": [0, 0, 0]            # Black
    }
    
    class Config:
        env_file = ".env"


settings = Settings()

# Ensure directories exist
settings.ASSETS_DIR.mkdir(parents=True, exist_ok=True)
settings.DICOM_DIR.mkdir(parents=True, exist_ok=True)
settings.IMAGES_DIR.mkdir(parents=True, exist_ok=True)
settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
settings.ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
