# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for VFAT Backend
Bundles the FastAPI backend into a standalone executable
"""

import sys
from pathlib import Path

block_cipher = None

# Get the backend directory
backend_dir = Path(SPECPATH)

# Analysis - collect all Python files and dependencies
a = Analysis(
    ['run.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[
        # Include the app package
        ('app', 'app'),
    ],
    hiddenimports=[
        # FastAPI and dependencies
        'fastapi',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        'fastapi.staticfiles',
        'fastapi.templating',
        'fastapi.responses',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'starlette',
        'starlette.routing',
        'starlette.responses',
        'starlette.middleware',
        'starlette.middleware.cors',
        'pydantic',
        'pydantic_core',
        'pydantic_settings',
        
        # Scientific computing
        'numpy',
        'scipy',
        'scipy.ndimage',
        'scipy.spatial',
        'scipy.spatial.transform',
        'skimage',
        'skimage.measure',
        'skimage.morphology',
        'skimage.filters',
        'skimage.segmentation',
        
        # Image processing
        'PIL',
        'PIL.Image',
        'cv2',
        
        # DICOM processing
        'pydicom',
        'pydicom.encoders',
        'pydicom.encoders.gdcm',
        'pydicom.encoders.pylibjpeg',
        
        # 3D processing
        'trimesh',
        'trimesh.exchange',
        'trimesh.exchange.gltf',
        
        # Async and IO
        'aiofiles',
        'aiofiles.os',
        'aiofiles.ospath',
        
        # Other
        'multipart',
        'python_multipart',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        'email_validator',
        'httptools',
        'watchfiles',
        'websockets',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# Create the PYZ archive
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Create the executable
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='vfat-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for debugging; set to False for release
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
