/**
 * VFAT Analyzer - Electron Main Process
 * Manages the Python backend and creates the application window
 */

const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// File-based logging for debugging (especially on Windows where console isn't visible)
let logFile = null;
function initLogging() {
  try {
    const logDir = app.getPath('logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, 'vfat-backend.log');
    logFile = fs.createWriteStream(logPath, { flags: 'a' });
    log(`=== VFAT Analyzer started at ${new Date().toISOString()} ===`);
    log(`Log file: ${logPath}`);
  } catch (e) {
    console.error('Failed to initialize logging:', e);
  }
}

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  if (logFile) {
    logFile.write(line + '\n');
  }
}

function logError(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ERROR: ${message}`;
  console.error(line);
  if (logFile) {
    logFile.write(line + '\n');
  }
}

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
    
    log(`Resources path: ${resourcesPath}`);
    log(`Backend directory: ${backendDir}`);
    
    // List contents of backend directory for debugging
    if (fs.existsSync(backendDir)) {
      try {
        const files = fs.readdirSync(backendDir);
        log(`Backend directory contents: ${files.join(', ')}`);
      } catch (e) {
        logError(`Failed to list backend directory: ${e.message}`);
      }
    } else {
      logError(`Backend directory does not exist: ${backendDir}`);
      // List resources directory
      try {
        const files = fs.readdirSync(resourcesPath);
        log(`Resources directory contents: ${files.join(', ')}`);
      } catch (e) {
        logError(`Failed to list resources directory: ${e.message}`);
      }
    }
    
    // Try to find the executable (could be with or without .exe extension)
    const possibleNames = process.platform === 'win32' 
      ? ['vfat-backend.exe', 'vfat-backend']
      : ['vfat-backend', 'vfat-backend.exe'];
    
    let executablePath = null;
    for (const name of possibleNames) {
      const testPath = path.join(backendDir, name);
      log(`Checking for backend at: ${testPath}`);
      if (fs.existsSync(testPath)) {
        executablePath = testPath;
        log(`Found backend executable: ${executablePath}`);
        break;
      }
    }
    
    // Fall back to expected platform default if not found
    if (!executablePath) {
      executablePath = process.platform === 'win32'
        ? path.join(backendDir, 'vfat-backend.exe')
        : path.join(backendDir, 'vfat-backend');
      logError(`Backend not found, using default path: ${executablePath}`);
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
      log(`Health check response: ${res.statusCode}`);
      resolve(res.statusCode === 200);
    });
    
    req.on('error', (err) => {
      log(`Health check error: ${err.message}`);
      resolve(false);
    });
    req.on('timeout', () => {
      log('Health check timeout');
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
  let attempts = 0;
  
  while (Date.now() - startTime < CONFIG.startupTimeout) {
    attempts++;
    if (await checkBackendHealth()) {
      log(`Backend is ready after ${attempts} attempts!`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  logError(`Backend failed to start within ${CONFIG.startupTimeout}ms (${attempts} attempts)`);
  return false;
}

/**
 * Start the Python backend process
 */
function startBackend() {
  if (backendProcess) {
    log('Backend already running');
    return;
  }
  
  const backendConfig = getBackendPath();
  log(`Starting backend: ${backendConfig.command}`);
  log(`Arguments: ${backendConfig.args.join(' ') || '(none)'}`);
  log(`Working directory: ${backendConfig.cwd}`);
  
  // Check if the backend executable exists
  if (!fs.existsSync(backendConfig.command)) {
    logError(`Backend executable not found: ${backendConfig.command}`);
    
    // List the directory contents to help debug
    const backendDir = path.dirname(backendConfig.command);
    log(`Checking directory: ${backendDir}`);
    if (fs.existsSync(backendDir)) {
      const files = fs.readdirSync(backendDir);
      log(`Files in backend directory: ${files.join(', ')}`);
    } else {
      logError(`Backend directory does not exist: ${backendDir}`);
      // Check parent directories
      const resourcesPath = process.resourcesPath;
      log(`Resources path: ${resourcesPath}`);
      if (fs.existsSync(resourcesPath)) {
        const resourceFiles = fs.readdirSync(resourcesPath);
        log(`Files in resources: ${resourceFiles.join(', ')}`);
      }
    }
    
    handleBackendCrash();
    return;
  }
  
  log('Backend executable found, starting process...');
  
  try {
    log(`Spawning process with PID tracking...`);
    backendProcess = spawn(backendConfig.command, backendConfig.args, {
      cwd: backendConfig.cwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PORT: String(CONFIG.backendPort)
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,  // Don't use shell to handle paths with spaces correctly
      windowsHide: false  // Show console window on Windows for debugging
    });
    
    log(`Backend process spawned with PID: ${backendProcess.pid}`);
    
    backendProcess.stdout.on('data', (data) => {
      log(`[Backend stdout] ${data.toString().trim()}`);
    });
    
    backendProcess.stderr.on('data', (data) => {
      log(`[Backend stderr] ${data.toString().trim()}`);
    });
    
    backendProcess.on('error', (error) => {
      logError(`Failed to start backend process: ${error.message}`);
      logError(`Error code: ${error.code || 'N/A'}`);
      backendProcess = null;
      handleBackendCrash();
    });
    
    backendProcess.on('exit', (code, signal) => {
      log(`Backend exited with code ${code}, signal ${signal}`);
      backendProcess = null;
      
      if (!isQuitting && code !== 0) {
        logError(`Backend crashed with exit code ${code}`);
        handleBackendCrash();
      }
    });
    
  } catch (error) {
    logError(`Exception starting backend: ${error.message}`);
    logError(`Stack: ${error.stack}`);
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
    log(`Attempting backend restart (${restartCount}/${CONFIG.maxRestarts})...`);
    setTimeout(startBackend, CONFIG.restartDelay);
  } else {
    logError('Maximum restart attempts reached');
    
    // Get log path for the user
    const logPath = app.getPath('logs');
    const logFile = path.join(logPath, 'vfat-backend.log');
    
    logError(`Backend could not be started. Log file: ${logFile}`);
    
    dialog.showErrorBox(
      'Backend Error',
      `The analysis backend could not be started.\n\n` +
      `Platform: ${process.platform}\n` +
      `Version: ${app.getVersion()}\n` +
      `Resources path: ${process.resourcesPath || 'N/A'}\n\n` +
      `Please check the log file at:\n${logFile}\n\n` +
      `You can open this file to see detailed error information.`
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
    log('Stopping backend...');
    
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
      log('Backend health check failed, restarting...');
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
  // Initialize file logging first
  initLogging();
  
  log('Initializing VFAT Analyzer...');
  log(`Platform: ${process.platform}`);
  log(`Architecture: ${process.arch}`);
  log(`Electron version: ${process.versions.electron}`);
  log(`Node version: ${process.versions.node}`);
  log(`App version: ${app.getVersion()}`);
  log(`App packaged: ${app.isPackaged}`);
  log(`App path: ${app.getAppPath()}`);
  log(`Resources path: ${process.resourcesPath || 'N/A'}`);
  log(`User data path: ${app.getPath('userData')}`);
  
  // Check if backend is already running (e.g., started by dev script)
  log('Checking if backend is already running...');
  const alreadyRunning = await checkBackendHealth();
  log(`Backend already running: ${alreadyRunning}`);
  
  if (alreadyRunning) {
    log('Backend detected, skipping startup...');
  } else {
    // Start backend
    log('No backend detected, starting...');
    startBackend();
    
    // Wait for backend to be ready
    log('Waiting for backend to become ready...');
    const backendReady = await waitForBackend();
    
    if (!backendReady) {
      const logPath = path.join(app.getPath('logs'), 'vfat-backend.log');
      logError('Backend failed to start - showing error dialog');
      dialog.showErrorBox(
        'Startup Error',
        `Failed to start the analysis backend.\n\n` +
        `Please check the log file at:\n${logPath}\n\n` +
        `This file contains detailed debugging information.`
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
  logError(`Uncaught exception: ${error.message}`);
  logError(`Stack: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection: ${reason}`);
});
