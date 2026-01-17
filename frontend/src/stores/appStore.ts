/**
 * Zustand store for application state management
 */

import { create } from 'zustand';
import type { 
  DicomSeries, 
  DicomImage, 
  AnalysisResult, 
  ModelInfo, 
  ViewMode,
  AnalysisProgress
} from '../types';
import api from '../services/api';

// LocalStorage keys for persisting view state
const STORAGE_KEYS = {
  selectedSeriesUid: 'vfat_selectedSeriesUid',
  viewMode: 'vfat_viewMode',
  selectedImageIndex: 'vfat_selectedImageIndex'
};

// Helper to save state to localStorage
const saveViewState = (seriesUid: string | null, viewMode: ViewMode, imageIndex: number) => {
  try {
    if (seriesUid) {
      localStorage.setItem(STORAGE_KEYS.selectedSeriesUid, seriesUid);
    } else {
      localStorage.removeItem(STORAGE_KEYS.selectedSeriesUid);
    }
    localStorage.setItem(STORAGE_KEYS.viewMode, viewMode);
    localStorage.setItem(STORAGE_KEYS.selectedImageIndex, String(imageIndex));
  } catch {
    // localStorage might be unavailable
  }
};

// Helper to load state from localStorage
const loadViewState = (): { seriesUid: string | null; viewMode: ViewMode; imageIndex: number } => {
  try {
    return {
      seriesUid: localStorage.getItem(STORAGE_KEYS.selectedSeriesUid),
      viewMode: (localStorage.getItem(STORAGE_KEYS.viewMode) as ViewMode) || 'original',
      imageIndex: parseInt(localStorage.getItem(STORAGE_KEYS.selectedImageIndex) || '0', 10)
    };
  } catch {
    return { seriesUid: null, viewMode: 'original', imageIndex: 0 };
  }
};

interface AppStore {
  // Series state
  series: DicomSeries[];
  selectedSeries: DicomSeries | null;
  analyzedSeriesIds: Set<string>;
  modelSeriesIds: Set<string>;
  
  // Images state
  images: DicomImage[];
  selectedImageIndex: number;
  
  // Analysis state
  analysisResult: AnalysisResult | null;
  isAnalyzing: boolean;
  analysisProgress: AnalysisProgress | null;
  
  // Model state
  modelInfo: ModelInfo | null;
  isGeneratingModel: boolean;
  
  // UI state
  viewMode: ViewMode;
  isLoading: boolean;
  uploadMessage: string | null;
  error: string | null;
  
  // Actions
  setViewMode: (mode: ViewMode) => void;
  setSelectedImageIndex: (index: number) => void;
  setError: (error: string | null) => void;
  
  // Async actions
  initialize: () => Promise<void>;
  loadDirectory: (path: string) => Promise<void>;
  uploadZipFile: (file: File) => Promise<void>;
  refreshSeries: () => Promise<void>;
  selectSeries: (series: DicomSeries) => Promise<void>;
  analyzeSeries: () => Promise<void>;
  generateModel: (tissues?: string[]) => Promise<void>;
  clearAnalysisAndModels: () => Promise<void>;
  clearSeriesResults: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  series: [],
  selectedSeries: null,
  analyzedSeriesIds: new Set<string>(),
  modelSeriesIds: new Set<string>(),
  images: [],
  selectedImageIndex: 0,
  analysisResult: null,
  isAnalyzing: false,
  analysisProgress: null,
  modelInfo: null,
  isGeneratingModel: false,
  viewMode: 'original',
  isLoading: false,
  uploadMessage: null,
  error: null,

  // Actions
  setViewMode: (mode) => {
    const { selectedSeries, selectedImageIndex } = get();
    saveViewState(selectedSeries?.series_uid || null, mode, selectedImageIndex);
    set({ viewMode: mode });
  },
  setSelectedImageIndex: (index) => {
    const { selectedSeries, viewMode } = get();
    saveViewState(selectedSeries?.series_uid || null, viewMode, index);
    set({ selectedImageIndex: index });
  },
  setError: (error) => set({ error }),

  // Initialize - scan for existing data on app startup
  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.initializeExistingData();
      const seriesData = Array.isArray(result.series) ? result.series : [];
      const analyzedIds = new Set<string>(result.analyzed_series || []);
      const modelIds = new Set<string>(result.model_series || []);
      
      set({ 
        series: seriesData,
        analyzedSeriesIds: analyzedIds,
        modelSeriesIds: modelIds,
        isLoading: false 
      });

      // Restore saved view state
      const savedState = loadViewState();
      if (savedState.seriesUid && seriesData.length > 0) {
        const savedSeries = seriesData.find(s => s.series_uid === savedState.seriesUid);
        if (savedSeries) {
          // Load the saved series
          set({ isLoading: true, selectedSeries: savedSeries });
          try {
            const images = await api.getSeriesImages(savedSeries.series_uid);
            
            let analysisResult: AnalysisResult | null = null;
            try {
              analysisResult = await api.getAnalysisResults(savedSeries.series_uid);
            } catch {
              // No analysis results yet
            }

            let modelInfo: ModelInfo | null = null;
            try {
              modelInfo = await api.getModelInfo(savedSeries.series_uid);
            } catch {
              // No model yet
            }

            // Determine best view mode - use saved if valid, otherwise fallback
            let viewMode = savedState.viewMode;
            if (viewMode === 'analyzed' && !analysisResult) {
              viewMode = 'original';
            }
            if (viewMode === '3d' && !modelInfo) {
              viewMode = analysisResult ? 'analyzed' : 'original';
            }

            // Validate saved image index
            const imageIndex = Math.min(
              Math.max(0, savedState.imageIndex), 
              images.length - 1
            );

            set({ 
              images, 
              selectedImageIndex: imageIndex >= 0 ? imageIndex : 0, 
              analysisResult,
              modelInfo,
              viewMode,
              isLoading: false 
            });
          } catch {
            set({ isLoading: false });
          }
        }
      }
    } catch (error) {
      set({ isLoading: false });
    }
  },

  // Load DICOM files from a directory
  loadDirectory: async (path) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.loadDicomDirectory(path);
      set({ series: result.data, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load directory',
        isLoading: false 
      });
    }
  },

  // Upload a zip file containing DICOM files
  uploadZipFile: async (file) => {
    // Clear saved view state when uploading new data
    saveViewState(null, 'original', 0);
    
    set({ 
      isLoading: true, 
      error: null, 
      uploadMessage: 'Uploading file...',
      series: [],
      selectedSeries: null,
      images: [],
      selectedImageIndex: 0,
      analysisResult: null,
      analysisProgress: null,
      modelInfo: null,
      viewMode: 'original',
      analyzedSeriesIds: new Set<string>(),
      modelSeriesIds: new Set<string>()
    });
    try {
      set({ uploadMessage: 'Processing DICOM files...' });
      const result = await api.uploadZipFile(file);
      set({ 
        series: result.data, 
        isLoading: false, 
        uploadMessage: `Loaded ${result.series_loaded} series successfully!`
      });
      setTimeout(() => set({ uploadMessage: null }), 3000);
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to upload zip file',
        isLoading: false,
        uploadMessage: null
      });
    }
  },

  // Refresh series list
  refreshSeries: async () => {
    set({ isLoading: true, error: null });
    try {
      const series = await api.listSeries();
      set({ series, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to refresh series',
        isLoading: false 
      });
    }
  },

  // Select a series and load its images
  selectSeries: async (series) => {
    set({ isLoading: true, error: null, selectedSeries: series });
    try {
      const images = await api.getSeriesImages(series.series_uid);
      
      let analysisResult: AnalysisResult | null = null;
      try {
        analysisResult = await api.getAnalysisResults(series.series_uid);
      } catch {
        // No analysis results yet
      }

      let modelInfo: ModelInfo | null = null;
      try {
        modelInfo = await api.getModelInfo(series.series_uid);
      } catch {
        // No model yet
      }

      // Update tracked IDs based on what we found
      const { analyzedSeriesIds, modelSeriesIds } = get();
      const newAnalyzedIds = new Set(analyzedSeriesIds);
      const newModelIds = new Set(modelSeriesIds);
      
      if (analysisResult) {
        newAnalyzedIds.add(series.series_uid);
      }
      if (modelInfo) {
        newModelIds.add(series.series_uid);
      }

      let viewMode: ViewMode = 'original';
      if (analysisResult) {
        viewMode = 'analyzed';
      }

      // Save view state to localStorage
      saveViewState(series.series_uid, viewMode, 0);

      set({ 
        images, 
        selectedImageIndex: 0, 
        analysisResult,
        modelInfo,
        viewMode,
        analyzedSeriesIds: newAnalyzedIds,
        modelSeriesIds: newModelIds,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load series',
        isLoading: false 
      });
    }
  },

  // Analyze the selected series with progress tracking
  analyzeSeries: async () => {
    const { selectedSeries, modelSeriesIds } = get();
    if (!selectedSeries) return;

    // Clear existing model info since we're re-analyzing
    const newModelIds = new Set(modelSeriesIds);
    newModelIds.delete(selectedSeries.series_uid);
    
    set({ 
      isAnalyzing: true, 
      error: null, 
      analysisProgress: null,
      modelInfo: null,
      modelSeriesIds: newModelIds
    });
    
    return new Promise<void>((resolve) => {
      api.analyzeSeriesWithProgress(
        selectedSeries.series_uid,
        (progress) => {
          set({ analysisProgress: progress });
          
          if (progress.type === 'complete' && progress.data) {
            const { analyzedSeriesIds, selectedImageIndex } = get();
            const newAnalyzedIds = new Set(analyzedSeriesIds);
            newAnalyzedIds.add(selectedSeries.series_uid);
            
            // Switch to analyzed view when complete
            saveViewState(selectedSeries.series_uid, 'analyzed', selectedImageIndex);
            
            set({ 
              analysisResult: progress.data, 
              isAnalyzing: false,
              analysisProgress: null,
              analyzedSeriesIds: newAnalyzedIds,
              viewMode: 'analyzed'
            });
            resolve();
          } else if (progress.type === 'error') {
            set({ 
              error: progress.message,
              isAnalyzing: false,
              analysisProgress: null
            });
            resolve();
          }
        }
      );
    });
  },

  // Generate 3D model (non-blocking with polling)
  generateModel: async (tissues) => {
    const { selectedSeries } = get();
    if (!selectedSeries) return;

    set({ isGeneratingModel: true, error: null });
    
    try {
      // Start generation in background
      await api.startModelGeneration(selectedSeries.series_uid, tissues);
      
      // Poll for completion without blocking
      const pollStatus = async () => {
        const { selectedSeries: currentSeries, isGeneratingModel } = get();
        if (!currentSeries || !isGeneratingModel) return;
        
        try {
          const status = await api.getModelGenerationStatus(currentSeries.series_uid);
          
          if (status.status === 'complete' && status.data) {
            const { modelSeriesIds, selectedImageIndex } = get();
            const newModelIds = new Set(modelSeriesIds);
            newModelIds.add(currentSeries.series_uid);
            
            // Switch to 3D view when complete
            saveViewState(currentSeries.series_uid, '3d', selectedImageIndex);
            
            set({ 
              modelInfo: status.data, 
              isGeneratingModel: false,
              modelSeriesIds: newModelIds,
              viewMode: '3d'
            });
          } else if (status.status === 'error') {
            set({ 
              error: status.message || 'Model generation failed',
              isGeneratingModel: false 
            });
          } else if (status.status === 'generating') {
            // Continue polling
            setTimeout(pollStatus, 1000);
          }
        } catch {
          // Continue polling on error
          setTimeout(pollStatus, 1000);
        }
      };
      
      // Start polling
      setTimeout(pollStatus, 1000);
      
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to start model generation',
        isGeneratingModel: false 
      });
    }
  },

  // Clear analysis results and 3D models (keeps DICOM images)
  clearAnalysisAndModels: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.clearAnalysisAndModels();
      set({
        analysisResult: null,
        modelInfo: null,
        analyzedSeriesIds: new Set<string>(),
        modelSeriesIds: new Set<string>(),
        viewMode: 'original',
        isLoading: false,
        uploadMessage: 'Analysis and models cleared!'
      });
      setTimeout(() => set({ uploadMessage: null }), 3000);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to clear data',
        isLoading: false
      });
    }
  },

  // Clear analysis and 3D model for current series only
  clearSeriesResults: async () => {
    const { selectedSeries, analyzedSeriesIds, modelSeriesIds, selectedImageIndex } = get();
    if (!selectedSeries) return;

    set({ isLoading: true, error: null });
    try {
      await api.clearSeriesResults(selectedSeries.series_uid);
      
      // Remove from tracked sets
      const newAnalyzedIds = new Set(analyzedSeriesIds);
      const newModelIds = new Set(modelSeriesIds);
      newAnalyzedIds.delete(selectedSeries.series_uid);
      newModelIds.delete(selectedSeries.series_uid);

      // Save view state and switch back to original
      saveViewState(selectedSeries.series_uid, 'original', selectedImageIndex);

      set({
        analysisResult: null,
        modelInfo: null,
        analyzedSeriesIds: newAnalyzedIds,
        modelSeriesIds: newModelIds,
        viewMode: 'original',
        isLoading: false,
        uploadMessage: 'Series data cleared!'
      });
      setTimeout(() => set({ uploadMessage: null }), 3000);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to clear series data',
        isLoading: false
      });
    }
  },
}));
