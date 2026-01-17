/**
 * TypeScript type definitions
 */

export interface DicomSeries {
  series_uid: string;
  series_description: string;
  modality: string;
  image_count: number;
  patient_name?: string;
  study_date?: string;
  rows?: number;
  columns?: number;
  pixel_spacing?: number[];
  slice_thickness?: number;
}

export interface DicomImage {
  index: number;
  instance_number: number;
  slice_location?: number;
}

export interface SliceStats {
  index: number;
  visceral_fat_pixels: number;
  subcutaneous_fat_pixels: number;
  visceral_fat_area_cm2: number;
}

export interface TissueStats {
  total_visceral_fat_volume: number;
  total_subcutaneous_fat_volume: number;
  visceral_fat_percentage: number;
  slice_stats: SliceStats[];
}

export interface AnalyzedImage {
  index: number;
  colored_image_path: string;
  stats: SliceStats;
}

export interface AnalysisResult {
  series_id: string;
  image_count: number;
  analyzed_images: AnalyzedImage[];
  tissue_stats: TissueStats;
}

export interface TissueInfo {
  name: string;
  color: string;
  opacity: number;
}

export interface ModelInfo {
  series_id: string;
  tissues: TissueInfo[];
  slice_count: number;
  dimensions: number[];
  voxel_spacing: number[];
  glb_path?: string;
  obj_path?: string;
}

export interface SlicePlane {
  slice_index: number;
  z_position: number;
  width: number;
  height: number;
  center: number[];
  normal: number[];
}

export interface ColorLegendItem {
  color: string;
  description: string;
}

export interface ColorLegend {
  visceral_fat: ColorLegendItem;
  subcutaneous_fat: ColorLegendItem;
  muscle: ColorLegendItem;
  organ: ColorLegendItem;
  bone: ColorLegendItem;
  background: ColorLegendItem;
}

export type ViewMode = 'original' | 'analyzed' | '3d';

export interface AnalysisProgress {
  type: 'start' | 'progress' | 'complete' | 'error';
  message: string;
  progress: number;
  total_images?: number;
  current_image?: number;
  step?: string;
  data?: AnalysisResult;
}

export interface AppState {
  // Series state
  series: DicomSeries[];
  selectedSeries: DicomSeries | null;
  
  // Images state
  images: DicomImage[];
  selectedImageIndex: number;
  
  // Analysis state
  analysisResult: AnalysisResult | null;
  isAnalyzing: boolean;
  
  // Model state
  modelInfo: ModelInfo | null;
  isGeneratingModel: boolean;
  
  // UI state
  viewMode: ViewMode;
  isLoading: boolean;
  error: string | null;
}
