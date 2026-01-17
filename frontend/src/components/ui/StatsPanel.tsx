/**
 * Statistics panel showing analysis results
 */

import { BarChart3, Percent, Box } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

export function StatsPanel() {
  const { analysisResult, selectedImageIndex } = useAppStore();

  if (!analysisResult) return null;

  const { tissue_stats } = analysisResult;
  const currentSliceStats = tissue_stats.slice_stats[selectedImageIndex];

  return (
    <div className="stats-panel">
      <h3 className="stats-title">
        <BarChart3 size={18} />
        Analysis Statistics
      </h3>

      <div className="stats-grid">
        <div className="stat-card highlight">
          <div className="stat-icon visceral">
            <Percent size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{tissue_stats.visceral_fat_percentage}%</span>
            <span className="stat-label">Visceral Fat</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon volume">
            <Box size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{tissue_stats.total_visceral_fat_volume.toFixed(1)}</span>
            <span className="stat-label">Visceral Fat (cm³)</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon subcut">
            <Box size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{tissue_stats.total_subcutaneous_fat_volume.toFixed(1)}</span>
            <span className="stat-label">Subcut. Fat (cm³)</span>
          </div>
        </div>
      </div>

      {currentSliceStats && (
        <div className="slice-stats">
          <h4>Current Slice (#{selectedImageIndex + 1})</h4>
          <div className="slice-stats-row">
            <span>Visceral Fat Area:</span>
            <span className="value">{currentSliceStats.visceral_fat_area_cm2} cm²</span>
          </div>
          <div className="slice-stats-row">
            <span>Visceral Fat Pixels:</span>
            <span className="value">{currentSliceStats.visceral_fat_pixels.toLocaleString()}</span>
          </div>
          <div className="slice-stats-row">
            <span>Subcutaneous Pixels:</span>
            <span className="value">{currentSliceStats.subcutaneous_fat_pixels.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
