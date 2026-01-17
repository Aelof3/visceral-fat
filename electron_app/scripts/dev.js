#!/usr/bin/env node
/**
 * VFAT Analyzer Development Script
 * Starts both the backend and frontend dev servers, then launches Electron
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const ELECTRON_DIR = path.join(ROOT_DIR, 'electron_app');

let processes = [];

function log(message) {
  console.log(`\n🚀 ${message}\n`);
}

function startProcess(name, command, args, cwd, env = {}) {
  console.log(`Starting ${name}: ${command} ${args.join(' ')}`);
  
  // Don't use shell: true to avoid issues with spaces in paths
  const proc = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    shell: false
  });
  
  proc.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) console.log(`[${name}] ${line}`);
    });
  });
  
  proc.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) console.error(`[${name}] ${line}`);
    });
  });
  
  proc.on('error', (error) => {
    console.error(`[${name}] Error: ${error.message}`);
  });
  
  proc.on('exit', (code) => {
    console.log(`[${name}] Exited with code ${code}`);
  });
  
  processes.push(proc);
  return proc;
}

function cleanup() {
  log('Shutting down...');
  processes.forEach(proc => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });
  process.exit(0);
}

async function dev() {
  // Handle cleanup on exit
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Step 1: Start Backend using venv python
    log('Starting Backend...');
    const venvPython = process.platform === 'win32' 
      ? path.join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe')
      : path.join(BACKEND_DIR, 'venv', 'bin', 'python');
    
    const runPy = path.join(BACKEND_DIR, 'run.py');
    
    startProcess(
      'Backend',
      venvPython,
      [runPy],
      BACKEND_DIR,
      { PYTHONUNBUFFERED: '1' }
    );

    // Wait a moment for backend to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Start Frontend dev server
    log('Starting Frontend dev server...');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    
    startProcess(
      'Frontend',
      npmCmd,
      ['run', 'dev', '--', '--port', '5174'],  // Use different port to avoid conflicts
      FRONTEND_DIR
    );

    // Wait for frontend to be ready
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Step 3: Start Electron
    log('Starting Electron...');
    startProcess(
      'Electron',
      npmCmd,
      ['run', 'start:dev'],
      ELECTRON_DIR,
      { NODE_ENV: 'development', VITE_PORT: '5174' }
    );

    log('Development environment running!');
    log('Press Ctrl+C to stop all processes');

  } catch (error) {
    console.error('\n❌ Dev startup failed:', error.message);
    cleanup();
  }
}

dev();
