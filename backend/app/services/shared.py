"""
Shared service instances to ensure data persistence across requests
"""

from app.services.dicom_service import DicomService
from app.services.analysis_service import AnalysisService
from app.services.model_service import ModelService

# Create singleton instances
dicom_service = DicomService()
analysis_service = AnalysisService()
model_service = ModelService()

# Wire up dependencies
analysis_service.set_dicom_service(dicom_service)
analysis_service.set_model_service(model_service)
model_service.set_services(dicom_service, analysis_service)
