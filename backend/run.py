"""
Server runner - handles both development and production (PyInstaller) modes
"""

import sys
import uvicorn
from app.config import settings

# Detect if running in a PyInstaller bundle
IS_FROZEN = getattr(sys, 'frozen', False)

if __name__ == "__main__":
    # Never use reload in frozen/packaged mode - it causes process spawning chaos
    use_reload = settings.DEBUG and not IS_FROZEN
    
    if IS_FROZEN:
        print(f"Running in packaged mode (frozen)")
        print(f"Executable: {sys.executable}")
    else:
        print(f"Running in development mode")
    
    print(f"Host: {settings.API_HOST}")
    print(f"Port: {settings.API_PORT}")
    print(f"Reload: {use_reload}")
    
    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=use_reload
    )
