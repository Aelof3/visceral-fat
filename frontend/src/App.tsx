/**
 * Main Application Component
 */

import { useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ImageViewer } from './components/viewers/ImageViewer';
import { ThreeDViewer } from './components/viewers/ThreeDViewer';
import { ViewModeToggle } from './components/ui/ViewModeToggle';
import { ActionButtons } from './components/ui/ActionButtons';
import { StatsPanel } from './components/ui/StatsPanel';
import { ColorLegend } from './components/ui/ColorLegend';
import { useAppStore } from './stores/appStore';
import './App.css';

function App() {
  const { 
    viewMode, 
    error, 
    setError,
    analysisResult,
    initialize
  } = useAppStore();

  // Initialize on app startup - scan for existing data
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  return (
    <div className="app">
      <Header />
      
      <div className="app-content">
        <Sidebar />
        
        <main className="main-content">
          {error && (
            <div className="error-toast">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          <div className="viewer-header">
            <ViewModeToggle />
            <ActionButtons />
          </div>

          <div className="viewer-area">
            {viewMode === '3d' ? (
              <ThreeDViewer />
            ) : (
              <ImageViewer />
            )}
          </div>

          {viewMode === 'analyzed' && analysisResult && (
            <div className="info-panels">
              <StatsPanel />
              <ColorLegend />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
