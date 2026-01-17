/**
 * Color legend component for tissue types
 */

const TISSUE_COLORS = [
  { name: 'Visceral Fat', color: '#FFA500', description: 'Fat around internal organs' },
  { name: 'Subcutaneous Fat', color: '#FFFF00', description: 'Fat under the skin' },
  { name: 'Muscle', color: '#FF0000', description: 'Muscle tissue' },
  { name: 'Organs', color: '#0080FF', description: 'Internal organs' },
  { name: 'Bone', color: '#FFFFFF', description: 'Bone structure' },
];

interface ColorLegendProps {
  compact?: boolean;
}

export function ColorLegend({ compact = false }: ColorLegendProps) {
  return (
    <div className={`color-legend ${compact ? 'compact' : ''}`}>
      <h4 className="legend-title">Tissue Legend</h4>
      <div className="legend-items">
        {TISSUE_COLORS.map((tissue) => (
          <div key={tissue.name} className="legend-item" title={tissue.description}>
            <span 
              className="legend-color" 
              style={{ backgroundColor: tissue.color }}
            />
            <span className="legend-name">{tissue.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
