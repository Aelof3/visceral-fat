/**
 * Toggle component for switching between view modes
 * Tabs become action buttons when content doesn't exist yet
 */

import { Image, Palette, Box, Loader2 } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

export function ViewModeToggle() {
  const { 
    viewMode, 
    setViewMode, 
    selectedSeries,
    analysisResult, 
    modelInfo,
    isAnalyzing,
    isGeneratingModel,
    analysisProgress,
    analyzeSeries,
    generateModel
  } = useAppStore();

  // Handle click on Analyzed tab/button
  const handleAnalyzedClick = () => {
    if (analysisResult) {
      // Already analyzed - switch to view
      setViewMode('analyzed');
    } else if (selectedSeries && !isAnalyzing) {
      // Not analyzed - trigger analysis
      analyzeSeries();
    }
  };

  // Handle click on 3D Model tab/button
  const handle3DClick = () => {
    if (modelInfo) {
      // Already has model - switch to view
      setViewMode('3d');
    } else if (analysisResult && !isGeneratingModel) {
      // Analyzed but no model - trigger generation
      generateModel();
    }
  };

  // Determine button states and labels
  const getAnalyzedButtonState = () => {
    if (isAnalyzing) {
      return {
        label: analysisProgress ? `${analysisProgress.progress}%` : 'Analyzing...',
        icon: <Loader2 className="spin" size={18} />,
        isAction: true,
        disabled: true
      };
    }
    if (!analysisResult) {
      return {
        label: 'Analyze',
        icon: <Palette size={18} />,
        isAction: true,
        disabled: !selectedSeries
      };
    }
    return {
      label: 'Analyzed',
      icon: <Palette size={18} />,
      isAction: false,
      disabled: false
    };
  };

  const get3DButtonState = () => {
    if (isGeneratingModel) {
      return {
        label: 'Generating...',
        icon: <Loader2 className="spin" size={18} />,
        isAction: true,
        disabled: true
      };
    }
    if (!modelInfo) {
      return {
        label: 'Generate 3D',
        icon: <Box size={18} />,
        isAction: true,
        disabled: !analysisResult
      };
    }
    return {
      label: '3D Model',
      icon: <Box size={18} />,
      isAction: false,
      disabled: false
    };
  };

  const analyzedState = getAnalyzedButtonState();
  const model3DState = get3DButtonState();

  return (
    <div className="view-mode-toggle">
      {/* Original - always a normal tab */}
      <button
        className={`toggle-btn ${viewMode === 'original' ? 'active' : ''}`}
        onClick={() => setViewMode('original')}
      >
        <Image size={18} />
        <span>Original</span>
      </button>

      {/* Analyzed - becomes Analyze button if not analyzed */}
      <button
        className={`toggle-btn ${viewMode === 'analyzed' ? 'active' : ''} ${analyzedState.isAction ? 'action-btn' : ''}`}
        onClick={handleAnalyzedClick}
        disabled={analyzedState.disabled}
        title={analyzedState.isAction && !analysisResult ? 'Click to analyze series' : 'View analyzed images'}
      >
        {analyzedState.icon}
        <span>{analyzedState.label}</span>
      </button>

      {/* 3D Model - becomes Generate 3D button if analyzed but no model */}
      <button
        className={`toggle-btn ${viewMode === '3d' ? 'active' : ''} ${model3DState.isAction ? 'action-btn' : ''}`}
        onClick={handle3DClick}
        disabled={model3DState.disabled}
        title={
          model3DState.disabled 
            ? 'Analyze series first' 
            : model3DState.isAction 
              ? 'Click to generate 3D model' 
              : 'View 3D model'
        }
      >
        {model3DState.icon}
        <span>{model3DState.label}</span>
      </button>
    </div>
  );
}
