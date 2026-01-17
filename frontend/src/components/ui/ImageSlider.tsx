/**
 * Slider component for navigating through images
 */

import { useAppStore } from '../../stores/appStore';

export function ImageSlider() {
  const { images, selectedImageIndex, setSelectedImageIndex } = useAppStore();

  if (images.length === 0) return null;

  return (
    <div className="image-slider">
      <label className="slider-label">
        Slice {selectedImageIndex + 1} of {images.length}
      </label>
      <input
        type="range"
        min={0}
        max={images.length - 1}
        value={selectedImageIndex}
        onChange={(e) => setSelectedImageIndex(parseInt(e.target.value, 10))}
        className="slider"
      />
      <div className="slider-markers">
        <span>1</span>
        <span>{Math.floor(images.length / 2)}</span>
        <span>{images.length}</span>
      </div>
    </div>
  );
}
