#!/usr/bin/env node
/**
 * VFAT Analyzer Build Script
 * Builds both the frontend and backend, then packages with Electron
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..', '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const ELECTRON_DIR = path.join(ROOT_DIR, 'electron_app');

function log(message) {
  console.log(`\n🔧 ${message}\n`);
}

function run(command, cwd = ROOT_DIR) {
  console.log(`> ${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function build() {
  const args = process.argv.slice(2);
  const skipBackend = args.includes('--skip-backend');
  const skipFrontend = args.includes('--skip-frontend');
  const platform = args.find(a => a.startsWith('--platform='))?.split('=')[1] || process.platform;

  try {
    // Step 1: Build Frontend
    if (!skipFrontend) {
      log('Building Frontend...');
      run('npm run build', FRONTEND_DIR);
      
      // Copy to electron_app
      const frontendDist = path.join(FRONTEND_DIR, 'dist');
      const electronFrontend = path.join(ELECTRON_DIR, 'frontend-dist');
      
      if (fs.existsSync(electronFrontend)) {
        fs.rmSync(electronFrontend, { recursive: true });
      }
      
      fs.cpSync(frontendDist, electronFrontend, { recursive: true });
      log('Frontend built and copied to electron_app/frontend-dist');
    }

    // Step 2: Build Backend with PyInstaller
    if (!skipBackend) {
      log('Building Backend with PyInstaller...');
      
      // Use venv pyinstaller directly (no need to activate)
      const pyinstaller = process.platform === 'win32' 
        ? path.join(BACKEND_DIR, 'venv', 'Scripts', 'pyinstaller.exe')
        : path.join(BACKEND_DIR, 'venv', 'bin', 'pyinstaller');
      
      const pyinstallerCmd = `"${pyinstaller}" --clean vfat-backend.spec`;
      
      run(pyinstallerCmd, BACKEND_DIR);
      log('Backend built successfully');
    }

    // Step 3: Install Electron dependencies
    log('Installing Electron dependencies...');
    run('npm install', ELECTRON_DIR);

    // Step 4: Package with electron-builder
    log(`Packaging for ${platform}...`);
    
    let packageCmd = 'npm run package';
    if (platform === 'darwin' || platform === 'mac') {
      packageCmd = 'npm run package:mac';
    } else if (platform === 'win32' || platform === 'win') {
      packageCmd = 'npm run package:win';
    } else if (platform === 'linux') {
      packageCmd = 'npm run package:linux';
    }
    
    run(packageCmd, ELECTRON_DIR);

    log('Build complete! Check electron_app/release for the packaged app.');

  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

build();
