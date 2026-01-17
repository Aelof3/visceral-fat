/**
 * VFAT Analyzer - Electron Main Process
 * Manages the Python backend and creates the application window
 */

const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// Configuration
const CONFIG = {
  backendPort: 8000,
  backendHost: '127.0.0.1',  // Use IPv4 explicitly (not 'localhost' which may resolve to IPv6)
  healthCheckInterval: 30000,  // 30 seconds
  healthCheckTimeout: 5000,    // 5 seconds
  startupTimeout: 30000,       // 30 seconds to wait for backend
  restartDelay: 2000,          // 2 seconds before restart
  maxRestarts: 3               // Maximum restart attempts
};

// State
let mainWindow = null;
let backendProcess = null;
let restartCount = 0;
let healthCheckTimer = null;
let isQuitting = false;

/**
 * Get the path to the backend executable
 */
function getBackendPath() {
  const isDev = !app.isPackaged;
  
  if (isDev) {
    // Development: run Python from venv
    const backendDir = path.join(__dirname, '..', 'backend');
    const venvPython = process.platform === 'win32'
      ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
      : path.join(backendDir, 'venv', 'bin', 'python');
    
    return {
      command: venvPython,
      args: [path.join(backendDir, 'run.py')],
      cwd: backendDir
    };
  } else {
    // Production: use bundled executable
    const resourcesPath = process.resourcesPath;
    const backendDir = path.join(resourcesPath, 'backend');
    
    // Try to find the executable (could be with or without .exe extension)
    const possibleNames = process.platform === 'win32' 
      ? ['vfat-backend.exe', 'vfat-backend']
      : ['vfat-backend', 'vfat-backend.exe'];
    
    let executablePath = null;
    for (const name of possibleNames) {
      const testPath = path.join(backendDir, name);
      console.log(`Checking for backend at: ${testPath}`);
      if (fs.existsSync(testPath)) {
        executablePath = testPath;
        console.log(`Found backend executable: ${executablePath}`);
        break;
      }
    }
    
    // Fall back to expected platform default if not found
    if (!executablePath) {
      executablePath = process.platform === 'win32'
        ? path.join(backendDir, 'vfat-backend.exe')
        : path.join(backendDir, 'vfat-backend');
      console.log(`Using default backend path: ${executablePath}`);
    }
    
    return {
      command: executablePath,
      args: [],
      cwd: backendDir
    };
  }
}

/**
 * Check if the backend is healthy
 */
function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: CONFIG.backendHost,
      port: CONFIG.backendPort,
      path: '/health',
      method: 'GET',
      timeout: CONFIG.healthCheckTimeout
    }, (res) => {
      console.log(`Health check response: ${res.statusCode}`);
      resolve(res.statusCode === 200);
    });
    
    req.on('error', (err) => {
      console.log(`Health check error: ${err.message}`);
      resolve(false);
    });
    req.on('timeout', () => {
      console.log('Health check timeout');
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

/**
 * Wait for the backend to become available
 */
async function waitForBackend() {
  const startTime = Date.now();
  
  while (Date.now() - startTime < CONFIG.startupTimeout) {
    if (await checkBackendHealth()) {
      console.log('Backend is ready!');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.error('Backend failed to start within timeout');
  return false;
}

/**
 * Start the Python backend process
 */
function startBackend() {
  if (backendProcess) {
    console.log('Backend already running');
    return;
  }
  
  const backendConfig = getBackendPath();
  console.log(`Starting backend: ${backendConfig.command} ${backendConfig.args.join(' ')}`);
  console.log(`Working directory: ${backendConfig.cwd}`);
  
  // Check if the backend executable exists
  if (!fs.existsSync(backendConfig.command)) {
    console.error(`Backend executable not found: ${backendConfig.command}`);
    
    // List the directory contents to help debug
    const backendDir = path.dirname(backendConfig.command);
    console.log(`Checking directory: ${backendDir}`);
    if (fs.existsSync(backendDir)) {
      const files = fs.readdirSync(backendDir);
      console.log(`Files in backend directory: ${files.join(', ')}`);
    } else {
      console.error(`Backend directory does not exist: ${backendDir}`);
      // Check parent directories
      const resourcesPath = process.resourcesPath;
      console.log(`Resources path: ${resourcesPath}`);
      if (fs.existsSync(resourcesPath)) {
        const resourceFiles = fs.readdirSync(resourcesPath);
        console.log(`Files in resources: ${resourceFiles.join(', ')}`);
      }
    }
    
    handleBackendCrash();
    return;
  }
  
  console.log('Backend executable found, starting process...');
  
  try {
    backendProcess = spawn(backendConfig.command, backendConfig.args, {
      cwd: backendConfig.cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PORT: String(CONFIG.backendPort)
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false  // Don't use shell to handle paths with spaces correctly
    });
    
    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });
    
    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });
    
    backendProcess.on('error', (error) => {
      console.error(`Failed to start backend: ${error.message}`);
      backendProcess = null;
      handleBackendCrash();
    });
    
    backendProcess.on('exit', (code, signal) => {
      console.log(`Backend exited with code ${code}, signal ${signal}`);
      backendProcess = null;
      
      if (!isQuitting && code !== 0) {
        handleBackendCrash();
      }
    });
    
  } catch (error) {
    console.error(`Error starting backend: ${error.message}`);
    backendProcess = null;
  }
}

/**
 * Handle backend crash - attempt restart
 */
function handleBackendCrash() {
  if (isQuitting) return;
  
  restartCount++;
  
  if (restartCount <= CONFIG.maxRestarts) {
    console.log(`Attempting backend restart (${restartCount}/${CONFIG.maxRestarts})...`);
    setTimeout(startBackend, CONFIG.restartDelay);
  } else {
    console.error('Maximum restart attempts reached');
    
    // Get log path for the user
    const logPath = app.getPath('logs');
    
    dialog.showErrorBox(
      'Backend Error',
      `The analysis backend has crashed and could not be restarted.\n\n` +
      `Platform: ${process.platform}\n` +
      `Resources path: ${process.resourcesPath || 'N/A'}\n\n` +
      `Please check the logs at:\n${logPath}\n\n` +
      `Or try reinstalling the application.`
    );
  }
}

/**
 * Stop the backend process
 */
function stopBackend() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  if (backendProcess) {
    console.log('Stopping backend...');
    
    // Try graceful shutdown first
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
    } else {
      backendProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (backendProcess) {
          backendProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    
    backendProcess = null;
  }
}

/**
 * Start periodic health checks
 */
function startHealthChecks() {
  healthCheckTimer = setInterval(async () => {
    if (isQuitting) return;
    
    const isHealthy = await checkBackendHealth();
    
    if (!isHealthy && backendProcess) {
      console.warn('Backend health check failed, restarting...');
      stopBackend();
      startBackend();
    }
  }, CONFIG.healthCheckInterval);
}

/**
 * Create the main application window
 */
function createWindow() {
  const isDev = !app.isPackaged;
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'VFAT Analyzer',
    backgroundColor: '#0a0f1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false  // Don't show until ready
  });
  
  // Load the app
  if (isDev) {
    // Development: load from Vite dev server (use port from env or default)
    const vitePort = process.env.VITE_PORT || '5174';
    mainWindow.loadURL(`http://localhost:${vitePort}`);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load built files
    mainWindow.loadFile(path.join(__dirname, 'frontend-dist', 'index.html'));
  }
  
  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * App initialization
 */
async function initialize() {
  console.log('Initializing VFAT Analyzer...');
  console.log(`Platform: ${process.platform}`);
  console.log(`App packaged: ${app.isPackaged}`);
  
  // Check if backend is already running (e.g., started by dev script)
  console.log('Checking if backend is already running...');
  const alreadyRunning = await checkBackendHealth();
  console.log(`Backend already running: ${alreadyRunning}`);
  
  if (alreadyRunning) {
    console.log('Backend detected, skipping startup...');
  } else {
    // Start backend
    console.log('No backend detected, starting...');
    startBackend();
    
    // Wait for backend to be ready
    const backendReady = await waitForBackend();
    
    if (!backendReady) {
      dialog.showErrorBox(
        'Startup Error',
        'Failed to start the analysis backend. Please check the logs and try again.'
      );
      app.quit();
      return;
    }
  }
  
  // Reset restart counter on successful start
  restartCount = 0;
  
  // Start health monitoring (only if we started the backend)
  if (!alreadyRunning) {
    startHealthChecks();
  }
  
  // Create the window
  createWindow();
}

// App event handlers
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

app.on('will-quit', () => {
  stopBackend();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
