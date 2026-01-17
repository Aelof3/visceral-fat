# VFAT Analyzer - Electron Desktop App

This directory contains the Electron wrapper for the VFAT (Visceral Fat) MRI Analysis application. It bundles the React frontend and Python FastAPI backend into a standalone desktop application.

## Architecture

```
VFAT Desktop App
├── main.js           # Electron main process (manages backend, creates window)
├── preload.js        # Secure bridge for renderer process
├── frontend-dist/    # Built React frontend (created during build)
├── scripts/
│   ├── build.js      # Production build script
│   └── dev.js        # Development script
└── release/          # Packaged applications (created during build)
```

## Prerequisites

### For Development
- Node.js 18+ and npm
- Python 3.10+
- Backend dependencies installed (`cd ../backend && pip install -r requirements.txt`)
- Frontend dependencies installed (`cd ../frontend && npm install`)

### For Building
- All development prerequisites
- PyInstaller (`pip install pyinstaller`)

## Development

### Quick Start

1. **Install Electron dependencies:**
   ```bash
   cd electron_app
   npm install
   ```

2. **Start development mode** (runs all three: backend, frontend dev server, Electron):
   ```bash
   node scripts/dev.js
   ```

   Or manually start each component:
   ```bash
   # Terminal 1: Backend
   cd ../backend
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   python run.py

   # Terminal 2: Frontend
   cd ../frontend
   npm run dev

   # Terminal 3: Electron
   cd ../electron_app
   npm run start:dev
   ```

### Development Mode Behavior
- Backend runs at `http://localhost:8000`
- Frontend dev server runs at `http://localhost:5173`
- Electron loads from the frontend dev server (hot reload enabled)
- DevTools open automatically

## Building for Production

### Full Build (Frontend + Backend + Package)

```bash
cd electron_app
node scripts/build.js
```

### Platform-Specific Builds

```bash
# macOS
node scripts/build.js --platform=mac

# Windows
node scripts/build.js --platform=win

# Linux
node scripts/build.js --platform=linux
```

### Skip Steps (for faster iteration)

```bash
# Skip backend build (use existing)
node scripts/build.js --skip-backend

# Skip frontend build (use existing)
node scripts/build.js --skip-frontend
```

### Manual Build Steps

1. **Build Frontend:**
   ```bash
   cd ../frontend
   npm run build
   cp -r dist ../electron_app/frontend-dist
   ```

2. **Build Backend:**
   ```bash
   cd ../backend
   source venv/bin/activate
   pyinstaller --clean vfat-backend.spec
   ```

3. **Package with Electron:**
   ```bash
   cd ../electron_app
   npm run package:mac   # or package:win or package:linux
   ```

## Output

After building, packaged applications are in `electron_app/release/`:

- **macOS:** `VFAT Analyzer-{version}.dmg`
- **Windows:** `VFAT Analyzer Setup {version}.exe`
- **Linux:** `VFAT Analyzer-{version}.AppImage`

## Configuration

### Backend Port
The backend runs on port 8000 by default. To change:
1. Update `CONFIG.backendPort` in `main.js`
2. Update the API base URL in `../frontend/src/services/api.ts`

### Backend Health Checks
The Electron main process monitors backend health and automatically restarts if it crashes:
- Health check interval: 30 seconds
- Maximum restart attempts: 3
- Startup timeout: 30 seconds

## Troubleshooting

### Backend won't start
- Check Python is installed and accessible
- Verify all backend dependencies are installed
- Check `../backend/venv` exists and is activated
- Look at console output for specific errors

### Frontend shows blank page
- Ensure frontend is built (`npm run build` in frontend directory)
- Check `frontend-dist/` exists in electron_app
- Verify no JavaScript errors in DevTools console

### Package build fails
- Ensure PyInstaller created the backend executable
- Check `../backend/dist/vfat-backend` exists
- Verify all native dependencies are available for target platform

### App crashes on startup
- Check if antivirus is blocking the bundled Python executable
- Try running the unpacked app from `release/*/` for more detailed errors
- Check system logs for crash reports

## Notes

- The bundled app size is ~200-400MB due to Python and scientific libraries
- First startup may take a few seconds while the backend initializes
- MRI data is processed locally - no internet connection required after installation
