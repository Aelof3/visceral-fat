/**
 * Sidebar component with series list and controls
 */

import { useState, useRef } from 'react';
import { 
  Layers,
  Loader2,
  Upload,
  FileArchive,
  Trash2
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { DicomSeries } from '../../types';

export function Sidebar() {
  const { 
    series, 
    selectedSeries, 
    isLoading,
    uploadMessage,
    analyzedSeriesIds,
    modelSeriesIds,
    uploadZipFile, 
    selectSeries,
    clearAnalysisAndModels
  } = useAppStore();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.zip')) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (selectedFile) {
      await uploadZipFile(selectedFile);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleSelectSeries = async (s: DicomSeries) => {
    await selectSeries(s);
  };

  // Get status for a series
  const getSeriesStatus = (seriesUid: string): 'none' | 'analyzed' | 'modeled' => {
    if (modelSeriesIds.has(seriesUid)) return 'modeled';
    if (analyzedSeriesIds.has(seriesUid)) return 'analyzed';
    return 'none';
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <h3 className="sidebar-title">
          <FileArchive size={18} />
          Upload DICOM ZIP
        </h3>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="upload-area" onClick={handleBrowseClick}>
          <Upload size={24} />
          <span className="upload-text">
            {selectedFile ? selectedFile.name : 'Click to select ZIP file'}
          </span>
          {selectedFile && (
            <span className="upload-size">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </span>
          )}
        </div>
        <button 
          onClick={handleUpload} 
          className="btn btn-primary upload-btn"
          disabled={isLoading || !selectedFile}
        >
          {isLoading ? (
            <>
              <Loader2 className="spin" size={16} />
              Processing...
            </>
          ) : (
            <>
              <Upload size={16} />
              Upload & Process
            </>
          )}
        </button>
        {uploadMessage && (
          <div className={`upload-message ${isLoading ? '' : 'success'}`}>
            {uploadMessage}
          </div>
        )}
        
        {/* Clear data button */}
        {(analyzedSeriesIds.size > 0 || modelSeriesIds.size > 0) && (
          <button 
            onClick={() => clearAnalysisAndModels()}
            className="btn btn-danger clear-btn"
            disabled={isLoading}
          >
            <Trash2 size={16} />
            Clear Analysis & Models
          </button>
        )}
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-title">
          <Layers size={18} />
          Series ({series.length})
        </h3>
        
        {/* Legend for status dots */}
        <div className="series-legend">
          <span className="legend-item">
            <span className="status-dot status-none"></span>
            Not analyzed
          </span>
          <span className="legend-item">
            <span className="status-dot status-analyzed"></span>
            Analyzed
          </span>
          <span className="legend-item">
            <span className="status-dot status-modeled"></span>
            + 3D Model
          </span>
        </div>

        <div className="series-list">
          {isLoading && series.length === 0 ? (
            <div className="loading-state">
              <Loader2 className="spin" size={20} />
              <span>Processing DICOM files...</span>
            </div>
          ) : series.length === 0 ? (
            <p className="empty-state">No series loaded</p>
          ) : (
            series.map((s, index) => {
              const seriesNum = index + 1;
              const uid = s?.series_uid || `series-${index}`;
              const imageCount = s?.image_count || 0;
              const isSelected = selectedSeries?.series_uid === uid;
              const status = getSeriesStatus(uid);
              
              return (
                <div 
                  key={uid} 
                  className={`series-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectSeries(s)}
                >
                  <div className="series-content">
                    <span className={`status-dot status-${status}`}></span>
                    <span className="series-number">#{seriesNum}</span>
                    <span className="series-images">{imageCount} images</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </aside>
  );
}
