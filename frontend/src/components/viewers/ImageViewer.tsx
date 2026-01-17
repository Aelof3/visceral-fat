/**
 * Image viewer component for displaying DICOM/analyzed images
 */

import { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import api from '../../services/api';

export function ImageViewer() {
  const { 
    selectedSeries, 
    selectedImageIndex, 
    setSelectedImageIndex,
    viewMode, 
    images 
  } = useAppStore();

  const [zoom, setZoom] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!selectedSeries || images.length === 0) {
      setImageUrl(null);
      return;
    }

    setIsLoading(true);

    // Get the appropriate image URL based on view mode
    const url = viewMode === 'analyzed'
      ? api.getAnalyzedImageUrl(selectedSeries.series_uid, selectedImageIndex)
      : api.getImageUrl(selectedSeries.series_uid, selectedImageIndex);

    setImageUrl(url);
    setIsLoading(false);
  }, [selectedSeries, selectedImageIndex, viewMode, images.length]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const handleReset = () => setZoom(1);

  if (!selectedSeries) {
    return (
      <div className="image-viewer empty">
        <div className="empty-message">
          <Maximize2 size={48} />
          <p>Select a series to view images</p>
        </div>
      </div>
    );
  }

  return (
    <div className="image-viewer">
      <div className="viewer-toolbar">
        <div className="toolbar-left">
          <button onClick={handleZoomOut} className="toolbar-btn" title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="toolbar-btn" title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <button onClick={handleReset} className="toolbar-btn" title="Reset Zoom">
            <RotateCcw size={18} />
          </button>
        </div>
        
        {images.length > 0 && (
          <div className="toolbar-slider">
            <span className="slider-label">Slice {selectedImageIndex + 1}/{images.length}</span>
            <input
              type="range"
              min={0}
              max={images.length - 1}
              value={selectedImageIndex}
              onChange={(e) => setSelectedImageIndex(parseInt(e.target.value, 10))}
              className="slice-range"
            />
          </div>
        )}
      </div>

      <div className="viewer-canvas">
        {isLoading ? (
          <div className="loading-indicator">Loading...</div>
        ) : imageUrl ? (
          <div 
            className="image-container"
            style={{ transform: `scale(${zoom})` }}
          >
            <img 
              src={imageUrl} 
              alt={`Slice ${selectedImageIndex + 1}`}
              onError={() => setImageUrl(null)}
            />
          </div>
        ) : (
          <div className="no-image">
            <p>Image not available</p>
          </div>
        )}
      </div>

    </div>
  );
}
