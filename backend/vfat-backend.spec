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
        'fastapi.routing',
        'fastapi.params',
        'fastapi.datastructures',
        'fastapi.exceptions',
        'fastapi.encoders',
        'fastapi.security',
        
        # Uvicorn and dependencies
        'uvicorn',
        'uvicorn.config',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'uvicorn.main',
        'uvicorn.server',
        'h11',
        
        # Starlette (FastAPI's foundation)
        'starlette',
        'starlette.applications',
        'starlette.routing',
        'starlette.responses',
        'starlette.requests',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.middleware.base',
        'starlette.middleware.errors',
        'starlette.middleware.exceptions',
        'starlette.staticfiles',
        'starlette.datastructures',
        'starlette.exceptions',
        'starlette.status',
        'starlette.types',
        'starlette.background',
        'starlette.concurrency',
        'starlette.formparsers',
        'starlette.convertors',
        
        # Pydantic
        'pydantic',
        'pydantic.main',
        'pydantic.fields',
        'pydantic.types',
        'pydantic.validators',
        'pydantic_core',
        'pydantic_core._pydantic_core',
        'pydantic_settings',
        'pydantic_settings.main',
        'pydantic_settings.sources',
        
        # Scientific computing - NumPy
        'numpy',
        'numpy.core',
        'numpy.core._methods',
        'numpy.core._dtype_ctypes',
        'numpy.random',
        'numpy.random.mtrand',
        'numpy.linalg',
        'numpy.fft',
        
        # Scientific computing - SciPy
        'scipy',
        'scipy.ndimage',
        'scipy.ndimage._filters',
        'scipy.ndimage._interpolation',
        'scipy.ndimage._measurements',
        'scipy.ndimage._morphology',
        'scipy.spatial',
        'scipy.spatial.transform',
        'scipy.special',
        'scipy.linalg',
        
        # Scientific computing - scikit-image
        'skimage',
        'skimage.measure',
        'skimage.measure._marching_cubes_lewiner',
        'skimage.measure._regionprops',
        'skimage.morphology',
        'skimage.morphology._skeletonize',
        'skimage.filters',
        'skimage.filters._gaussian',
        'skimage.segmentation',
        'skimage._shared',
        'skimage._shared.geometry',
        'skimage.util',
        'skimage.util.dtype',
        
        # Image processing - Pillow
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'PIL.ImageFont',
        'PIL.ImageOps',
        'PIL.PngImagePlugin',
        'PIL.JpegImagePlugin',
        
        # OpenCV (if used)
        'cv2',
        
        # DICOM processing
        'pydicom',
        'pydicom.dataset',
        'pydicom.datadict',
        'pydicom.uid',
        'pydicom.pixel_data_handlers',
        'pydicom.encoders',
        'pydicom.encoders.gdcm',
        'pydicom.encoders.pylibjpeg',
        'pydicom.encoders.native',
        
        # 3D processing - Trimesh
        'trimesh',
        'trimesh.base',
        'trimesh.scene',
        'trimesh.scene.scene',
        'trimesh.exchange',
        'trimesh.exchange.gltf',
        'trimesh.exchange.export',
        'trimesh.smoothing',
        'trimesh.visual',
        'trimesh.visual.color',
        'trimesh.visual.material',
        'trimesh.transformations',
        'trimesh.geometry',
        'trimesh.grouping',
        'trimesh.util',
        
        # Async and IO
        'aiofiles',
        'aiofiles.os',
        'aiofiles.ospath',
        'aiofiles.base',
        'aiofiles.threadpool',
        
        # Other web dependencies
        'multipart',
        'python_multipart',
        'python_multipart.multipart',
        'anyio',
        'anyio._core',
        'anyio._backends',
        'anyio._backends._asyncio',
        'sniffio',
        'email_validator',
        'httptools',
        'watchfiles',
        'websockets',
        'click',
        'typing_extensions',
        'dotenv',
        'python_dotenv',
        
        # Medical imaging - nibabel (if used transitively)
        'nibabel',
        'nibabel.nifti1',
        'nibabel.nifti2',
        
        # Machine learning - scikit-learn
        'sklearn',
        'sklearn.utils',
        'sklearn.utils._cython_blas',
        'sklearn.neighbors',
        'sklearn.tree',
        'sklearn.ensemble',
        
        # STL export
        'stl',
        'stl.mesh',
        
        # Standard library (sometimes needed explicitly on Windows)
        'concurrent',
        'concurrent.futures',
        'json',
        'hashlib',
        'zipfile',
        'tempfile',
        'shutil',
        'traceback',
        'asyncio',
        'asyncio.events',
        'asyncio.base_events',
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
