/**
 * Action buttons for re-analyze, regenerate 3D model, and clear data
 * Only shows when content already exists (for re-doing actions)
 */

import { Image, Box, Loader2, Trash2 } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

export function ActionButtons() {
  const { 
    selectedSeries,
    isAnalyzing,
    isGeneratingModel,
    isLoading,
    analysisResult,
    analysisProgress,
    modelInfo,
    analyzeSeries,
    generateModel,
    clearSeriesResults
  } = useAppStore();

  // Don't show if no series selected
  if (!selectedSeries) {
    return null;
  }

  // Only show buttons for re-doing actions (when content exists)
  const showReanalyze = analysisResult !== null;
  const showRegenerate = modelInfo !== null;
  const showClear = analysisResult !== null || modelInfo !== null;

  // If no buttons needed, don't render
  if (!showReanalyze && !showRegenerate && !showClear) {
    return null;
  }

  const handleClear = () => {
    if (window.confirm('Clear analysis and 3D model data for this series? Original images will be kept.')) {
      clearSeriesResults();
    }
  };

  return (
    <div className="action-buttons-inline">
      {/* Re-analyze button - only shows when already analyzed */}
      {showReanalyze && (
        <button 
          onClick={() => analyzeSeries()}
          className="btn btn-action"
          disabled={isAnalyzing}
          title="Re-analyze the series"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="spin" size={16} />
              {analysisProgress ? `${analysisProgress.progress}%` : 'Analyzing...'}
            </>
          ) : (
            <>
              <Image size={16} />
              Re-analyze
            </>
          )}
        </button>
      )}
      
      {/* Regenerate 3D button - only shows when model exists */}
      {showRegenerate && (
        <button 
          onClick={() => generateModel()}
          className="btn btn-action"
          disabled={isGeneratingModel}
          title="Regenerate the 3D model"
        >
          {isGeneratingModel ? (
            <>
              <Loader2 className="spin" size={16} />
              Generating...
            </>
          ) : (
            <>
              <Box size={16} />
              Regenerate 3D
            </>
          )}
        </button>
      )}

      {/* Clear button - shows when analysis or model exists */}
      {showClear && (
        <button 
          onClick={handleClear}
          className="btn btn-action btn-danger"
          disabled={isAnalyzing || isGeneratingModel || isLoading}
          title="Clear analysis and 3D model for this series"
        >
          <Trash2 size={16} />
          Clear
        </button>
      )}
    </div>
  );
}
