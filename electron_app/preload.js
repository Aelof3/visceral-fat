/**
 * VFAT Analyzer - Preload Script
 * Provides a secure bridge between the renderer process and Node.js
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// a subset of Node.js and Electron APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  
  // App version
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // File dialogs
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  
  // Backend status
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  
  // Events from main process
  onBackendStatus: (callback) => {
    ipcRenderer.on('backend-status', (event, status) => callback(status));
  },
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Log that preload script loaded
console.log('VFAT Analyzer preload script loaded');
