/**
 * API service for communicating with the backend
 */

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { 
  DicomSeries, 
  DicomImage, 
  AnalysisResult, 
  ModelInfo, 
  SlicePlane,
  ColorLegend,
  AnalysisProgress
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000,  // 60 seconds default timeout
    });
  }

  // Health check
  async healthCheck(): Promise<{ status: string; message: string }> {
    const response = await this.client.get('/');
    return response.data;
  }

  // Initialization - scan for existing data
  async initializeExistingData(): Promise<{
    series: DicomSeries[];
    analyzed_series: string[];
    model_series: string[];
  }> {
    const response = await this.client.get('/api/dicom/init');
    return response.data;
  }

  // Clear analysis results and 3D models (keeps DICOM images)
  async clearAnalysisAndModels(): Promise<{ message: string }> {
    const response = await this.client.delete('/api/dicom/clear-results');
    return response.data;
  }

  // Clear analysis and 3D model for a specific series
  async clearSeriesResults(seriesUid: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/dicom/series/${seriesUid}/clear-results`);
    return response.data;
  }

  // DICOM endpoints
  async uploadDicomFiles(files: FileList): Promise<{ files_processed: number; data: unknown[] }> {
    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });
    
    const response = await this.client.post('/api/dicom/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async loadDicomDirectory(directoryPath: string): Promise<{ series_loaded: number; data: DicomSeries[] }> {
    const response = await this.client.post('/api/dicom/load-directory', null, {
      params: { directory_path: directoryPath },
    });
    return response.data;
  }

  async uploadZipFile(file: File): Promise<{ series_loaded: number; data: DicomSeries[]; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await this.client.post('/api/dicom/upload-zip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000,  // 10 minutes for large uploads
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return response.data;
  }

  async listSeries(): Promise<DicomSeries[]> {
    const response = await this.client.get('/api/dicom/series');
    return response.data.series;
  }

  async getSeriesInfo(seriesId: string): Promise<DicomSeries> {
    const response = await this.client.get(`/api/dicom/series/${seriesId}`);
    return response.data.data;
  }

  async getSeriesImages(seriesId: string): Promise<DicomImage[]> {
    const response = await this.client.get(`/api/dicom/series/${seriesId}/images`);
    return response.data.images;
  }

  getImageUrl(seriesId: string, imageIndex: number): string {
    return `${API_BASE_URL}/api/dicom/series/${seriesId}/image/${imageIndex}`;
  }

  // Analysis endpoints
  async analyzeSeries(seriesId: string): Promise<AnalysisResult> {
    const response = await this.client.post(`/api/analysis/analyze/${seriesId}`);
    return response.data.data;
  }

  analyzeSeriesWithProgress(
    seriesId: string, 
    onProgress: (progress: AnalysisProgress) => void
  ): { abort: () => void } {
    const abortController = new AbortController();
    
    const fetchStream = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/analysis/analyze-stream/${seriesId}`,
          { signal: abortController.signal }
        );
        
        const reader = response.body?.getReader();
        if (!reader) return;
        
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onProgress(data);
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          onProgress({ type: 'error', message: (error as Error).message, progress: 0 });
        }
      }
    };
    
    fetchStream();
    
    return { abort: () => abortController.abort() };
  }

  async getAnalysisResults(seriesId: string): Promise<AnalysisResult> {
    const response = await this.client.get(`/api/analysis/results/${seriesId}`);
    return response.data.data;
  }

  getAnalyzedImageUrl(seriesId: string, imageIndex: number, overlay: boolean = true): string {
    return `${API_BASE_URL}/api/analysis/results/${seriesId}/image/${imageIndex}?overlay=${overlay}`;
  }

  async getColorLegend(): Promise<ColorLegend> {
    const response = await this.client.get('/api/analysis/results/legend/legend');
    return response.data.legend;
  }

  // 3D Model endpoints
  async startModelGeneration(seriesId: string, tissues?: string[]): Promise<{ status: string; message: string }> {
    const response = await this.client.post(`/api/model/generate/${seriesId}`, null, {
      params: tissues ? { include_tissues: tissues } : undefined,
    });
    return response.data;
  }

  async getModelGenerationStatus(seriesId: string): Promise<{
    status: string;
    progress: number;
    message: string;
    data?: ModelInfo;
    error?: string;
  }> {
    const response = await this.client.get(`/api/model/generate/${seriesId}/status`);
    return response.data;
  }

  // Legacy method for compatibility
  async generateModel(seriesId: string, tissues?: string[]): Promise<ModelInfo> {
    // Start generation
    await this.startModelGeneration(seriesId, tissues);
    
    // Poll for completion
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const status = await this.getModelGenerationStatus(seriesId);
      
      if (status.status === 'complete' && status.data) {
        return status.data;
      } else if (status.status === 'error') {
        throw new Error(status.message || 'Model generation failed');
      }
    }
  }

  getModelUrl(seriesId: string, format: string = 'glb'): string {
    // Add cache-busting timestamp to avoid loading stale/corrupted cached models
    const timestamp = Date.now();
    return `${API_BASE_URL}/api/model/download/${seriesId}?format=${format}&t=${timestamp}`;
  }

  async getModelInfo(seriesId: string): Promise<ModelInfo> {
    const response = await this.client.get(`/api/model/info/${seriesId}`);
    return response.data.data;
  }

  async getSlicePlane(seriesId: string, sliceIndex: number): Promise<SlicePlane> {
    const response = await this.client.get(`/api/model/slice/${seriesId}/${sliceIndex}`);
    return response.data.data;
  }

  async listModels(): Promise<{ series_id: string; tissues: string[]; slice_count: number }[]> {
    const response = await this.client.get('/api/model/list');
    return response.data.models;
  }
}

export const api = new ApiService();
export default api;
