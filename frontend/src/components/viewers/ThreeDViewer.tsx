/**
 * 3D Model viewer using Three.js and React Three Fiber
 */

import { Suspense, useRef, useState, useEffect, useCallback, Component, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  useGLTF, 
  Html,
  PerspectiveCamera
} from '@react-three/drei';
import * as THREE from 'three';
import { 
  Eye, 
  EyeOff,
  Layers,
  Focus,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import api from '../../services/api';

// Error boundary to catch WebGL/Three.js crashes
interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ModelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('3D Viewer error:', error);
    this.props.onError?.();
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="model-error">
          <AlertTriangle size={48} />
          <p>Failed to load 3D model</p>
          <p className="hint">The model may be corrupted or too large</p>
          <button onClick={this.reset} className="btn btn-secondary">
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface TissueOpacity {
  [key: string]: number; // 0-1 opacity value
}

interface ModelProps {
  url: string;
  onLoaded?: (boundingBox: THREE.Box3) => void;
  tissueOpacity: TissueOpacity;
}

function Model({ url, onLoaded, tissueOpacity }: ModelProps) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (groupRef.current && scene) {
      // Clone the scene to avoid modifying the cached version
      const clonedScene = scene.clone();
      
      // Clear any existing children
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }
      
      // Add the cloned scene
      groupRef.current.add(clonedScene);
      
      // Setup materials for double-sided rendering
      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const setupMaterial = (mat: THREE.Material) => {
            mat.side = THREE.DoubleSide;
            mat.transparent = true;
            mat.depthWrite = false;
          };
          if (Array.isArray(child.material)) {
            child.material.forEach(setupMaterial);
          } else {
            setupMaterial(child.material);
          }
        }
      });
      
      // Get bounding box of the model
      const box = new THREE.Box3().setFromObject(groupRef.current);
      const center = box.getCenter(new THREE.Vector3());
      
      // Center the model at origin
      groupRef.current.position.set(-center.x, -center.y, -center.z);
      
      // Notify parent about the bounding box (for camera positioning)
      if (onLoaded) {
        const newBox = new THREE.Box3().setFromObject(groupRef.current);
        onLoaded(newBox);
      }
    }
  }, [scene, onLoaded]);

  // Update opacity and material properties of tissue parts
  // Use mesh index since GLB naming from trimesh may not be reliable
  useEffect(() => {
    if (groupRef.current) {
      // Collect all meshes
      const meshes: THREE.Mesh[] = [];
      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });
      
      // Tissue order as exported by backend (default: body, visceral_fat, organs)
      // Note: subcutaneous_fat is not included by default
      const tissueOrder = ['body', 'visceral_fat', 'organs'];
      const tissueColors: { [key: string]: number } = {
        'body': 0xC8C8C8,
        'visceral_fat': 0xFFA500,
        'subcutaneous_fat': 0xFFFF00,
        'organs': 0x0080FF
      };
      
      meshes.forEach((mesh, index) => {
        // Use index to determine tissue type (matches export order)
        const tissueKey = tissueOrder[index];
        if (!tissueKey || !(tissueKey in tissueOpacity)) return;
        
        const opacity = tissueOpacity[tissueKey];
        mesh.visible = opacity > 0;
        
        // Create a new material with proper opacity support
        // This replaces the vertex-colored material from GLB
        const newMaterial = new THREE.MeshStandardMaterial({
          color: tissueColors[tissueKey],
          opacity: opacity,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: opacity >= 0.99,
          roughness: 0.7,
          metalness: 0.1
        });
        
        mesh.material = newMaterial;
      });
    }
  }, [tissueOpacity]);

  return (
    <group 
      ref={groupRef} 
      rotation={[-Math.PI / 2, 0, 0]}
    />
  );
}

interface SlicePlaneProps {
  modelBox: THREE.Box3 | null;
  sliceIndex: number;
  totalSlices: number;
  visible: boolean;
}

function SlicePlane({ modelBox, sliceIndex, totalSlices, visible }: SlicePlaneProps) {
  if (!visible || !modelBox || totalSlices === 0) return null;
  
  const size = modelBox.getSize(new THREE.Vector3());
  const center = modelBox.getCenter(new THREE.Vector3());
  
  // Slices are stacked along X axis (skewered by X)
  // Plane moves along X, perpendicular to X axis (facing left/right)
  const sliceRatio = sliceIndex / Math.max(totalSlices - 1, 1);
  const xPos = center.x + size.x * (sliceRatio - 0.5);
  
  // Plane size covers the Y and Z extent
  const planeWidth = Math.max(size.y, size.z) * 1.3;
  const planeHeight = Math.max(size.y, size.z) * 1.3;
  
  return (
    <mesh 
      position={[xPos, center.y, center.z]} 
      rotation={[0, Math.PI / 2, 0]}  // Rotated to be perpendicular to X axis
    >
      <planeGeometry args={[planeWidth, planeHeight]} />
      <meshBasicMaterial 
        color="#00ff88" 
        transparent 
        opacity={0.4} 
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="model-loading">
        <div className="spinner" />
        <p>Loading 3D Model...</p>
      </div>
    </Html>
  );
}

interface SceneProps {
  modelUrl: string | null;
  fitToView: number;
  showSlicePlane: boolean;
  sliceIndex: number;
  totalSlices: number;
  tissueOpacity: TissueOpacity;
}

function Scene({ modelUrl, fitToView, showSlicePlane, sliceIndex, totalSlices, tissueOpacity }: SceneProps) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const [modelBox, setModelBox] = useState<THREE.Box3 | null>(null);

  const fitCameraToModel = useCallback(() => {
    if (!modelBox || !controlsRef.current) return;
    
    const size = modelBox.getSize(new THREE.Vector3());
    const center = modelBox.getCenter(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
    cameraDistance *= 1.5;
    
    camera.position.set(
      center.x + cameraDistance * 0.5,
      center.y + cameraDistance * 0.5,
      center.z + cameraDistance
    );
    
    const perspCamera = camera as THREE.PerspectiveCamera;
    perspCamera.near = 0.01;
    perspCamera.far = Math.max(cameraDistance * 100, 100000);
    perspCamera.updateProjectionMatrix();
    
    controlsRef.current.target.copy(center);
    controlsRef.current.update();
  }, [modelBox, camera]);

  useEffect(() => {
    fitCameraToModel();
  }, [modelBox, fitCameraToModel]);

  useEffect(() => {
    if (fitToView > 0) {
      fitCameraToModel();
    }
  }, [fitToView, fitCameraToModel]);

  const handleModelLoaded = useCallback((box: THREE.Box3) => {
    setModelBox(box);
  }, []);

  return (
    <>
      <PerspectiveCamera 
        makeDefault 
        position={[0, 5, 10]} 
        fov={45} 
        near={0.01}
        far={100000}
      />
      <OrbitControls 
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={0.01}
        maxDistance={Infinity}
        target={[0, 0, 0]}
      />
      
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} />
      <directionalLight position={[-5, -5, -5]} intensity={0.8} />
      <directionalLight position={[0, 10, 0]} intensity={1.0} />
      <directionalLight position={[0, -10, 0]} intensity={0.5} />

      {modelUrl ? (
        <Suspense fallback={<LoadingFallback />}>
          <Model 
            url={modelUrl} 
            onLoaded={handleModelLoaded} 
            tissueOpacity={tissueOpacity}
          />
          <SlicePlane 
            modelBox={modelBox}
            sliceIndex={sliceIndex}
            totalSlices={totalSlices}
            visible={showSlicePlane}
          />
        </Suspense>
      ) : (
        <Html center>
          <div className="no-model-message">
            <Layers size={48} />
            <p>No 3D model available</p>
            <p className="hint">Generate a model first</p>
          </div>
        </Html>
      )}
    </>
  );
}

// Tissue info for display
const TISSUE_CONFIG: { [key: string]: { label: string; color: string } } = {
  body: { label: 'Body', color: '#C8C8C8' },
  visceral_fat: { label: 'Visceral Fat', color: '#FFA500' },
  subcutaneous_fat: { label: 'Subcut. Fat', color: '#FFFF00' },
  organs: { label: 'Organs/Muscle', color: '#0080FF' }
};

// Default opacity values
const DEFAULT_OPACITY: TissueOpacity = {
  body: 0.35,
  visceral_fat: 1.0,
  subcutaneous_fat: 1.0,
  organs: 1.0
};

export function ThreeDViewer() {
  const { selectedSeries, modelInfo, selectedImageIndex, setSelectedImageIndex, images, analysisResult } = useAppStore();
  const [showSliceNav, setShowSliceNav] = useState(true);
  const [showSlicePlane, setShowSlicePlane] = useState(true);
  const [showTissuePanel, setShowTissuePanel] = useState(true);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [fitToViewTrigger, setFitToViewTrigger] = useState(0);
  
  // Tissue opacity state (0-1, body starts transparent)
  const [tissueOpacity, setTissueOpacity] = useState<TissueOpacity>({ ...DEFAULT_OPACITY });

  useEffect(() => {
    if (selectedSeries && modelInfo) {
      setModelUrl(api.getModelUrl(selectedSeries.series_uid, 'glb'));
      setFitToViewTrigger(prev => prev + 1);
    } else {
      setModelUrl(null);
    }
  }, [selectedSeries, modelInfo]);

  const handleFitToView = () => {
    setFitToViewTrigger(prev => prev + 1);
  };

  const handleOpacityChange = (tissue: string, opacity: number) => {
    setTissueOpacity(prev => ({
      ...prev,
      [tissue]: opacity
    }));
  };

  const resetOpacityToDefaults = () => {
    setTissueOpacity({ ...DEFAULT_OPACITY });
  };

  // Get available tissues from model info
  const availableTissues = modelInfo?.tissues.map(t => t.name) || [];

  return (
    <div className="three-d-viewer">
      <div className="viewer-toolbar viewer-toolbar-left">
        <button 
          className="toolbar-btn"
          onClick={handleFitToView}
          title="Fit model to view"
        >
          <Focus size={18} />
        </button>
        <button 
          className={`toolbar-btn ${showTissuePanel ? 'active' : ''}`}
          onClick={() => setShowTissuePanel(!showTissuePanel)}
          title="Toggle tissue visibility panel"
        >
          <Layers size={18} />
        </button>
        <button 
          className={`toolbar-btn ${showSlicePlane ? 'active' : ''}`}
          onClick={() => setShowSlicePlane(!showSlicePlane)}
          title={showSlicePlane ? 'Hide slice plane' : 'Show slice plane'}
        >
          <Layers size={18} />
        </button>
        <button 
          className={`toolbar-btn ${showSliceNav ? 'active' : ''}`}
          onClick={() => setShowSliceNav(!showSliceNav)}
          title={showSliceNav ? 'Hide Slice Navigator' : 'Show Slice Navigator'}
        >
          {showSliceNav ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      </div>

      <div className="canvas-container">
        <ModelErrorBoundary>
          <Canvas>
            <Scene 
              modelUrl={modelUrl} 
              fitToView={fitToViewTrigger}
              showSlicePlane={showSlicePlane}
              sliceIndex={selectedImageIndex}
              totalSlices={images.length}
              tissueOpacity={tissueOpacity}
            />
          </Canvas>
        </ModelErrorBoundary>
      </div>

      {/* Tissue opacity panel */}
      {showTissuePanel && modelInfo && availableTissues.length > 0 && (
        <div className="tissue-panel">
          <div className="tissue-panel-header">
            <h4>Tissue Opacity</h4>
            <button 
              className="reset-btn"
              onClick={resetOpacityToDefaults}
              title="Reset to default values"
            >
              Reset
            </button>
          </div>
          {availableTissues.map(tissue => {
            const config = TISSUE_CONFIG[tissue] || { label: tissue, color: '#888' };
            const opacity = tissueOpacity[tissue] ?? 1.0;
            return (
              <div key={tissue} className="tissue-opacity-control">
                <div className="tissue-header">
                  <span 
                    className="tissue-color" 
                    style={{ backgroundColor: config.color, opacity: opacity }}
                  />
                  <span className="tissue-label">{config.label}</span>
                  <span className="opacity-value">{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => handleOpacityChange(tissue, parseInt(e.target.value) / 100)}
                  className="opacity-slider"
                />
              </div>
            );
          })}
        </div>
      )}

      {modelInfo && (
        <div className="model-info-bar">
          <span>Tissues: {modelInfo.tissues.map(t => t.name).join(', ')}</span>
          <span>Slices: {modelInfo.slice_count}</span>
        </div>
      )}

      {/* Slice navigator panel */}
      {showSliceNav && images.length > 0 && (
        <div className="slice-panel">
          <h4>Slice Navigator</h4>
          <input
            type="range"
            min={0}
            max={images.length - 1}
            value={selectedImageIndex}
            onChange={(e) => setSelectedImageIndex(parseInt(e.target.value))}
            className="slice-slider"
          />
          <div className="slice-current">
            Slice {selectedImageIndex + 1} of {images.length}
          </div>
        </div>
      )}

      {/* Slice preview - shows analyzed image in bottom left */}
      {showSliceNav && selectedSeries && analysisResult && (
        <div className="slice-preview">
          <div className="slice-preview-header">
            <span>Slice {selectedImageIndex + 1}</span>
          </div>
          <img 
            src={api.getAnalyzedImageUrl(selectedSeries.series_uid, selectedImageIndex, true)}
            alt={`Slice ${selectedImageIndex + 1}`}
            className="slice-preview-image"
          />
        </div>
      )}
    </div>
  );
}
