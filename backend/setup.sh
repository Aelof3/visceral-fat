#!/bin/bash
# Backend setup script

echo "Setting up Visceral Fat MRI Analysis Backend..."

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

echo ""
echo "Setup complete!"
echo ""
echo "To start the server:"
echo "  1. Activate the virtual environment: source venv/bin/activate"
echo "  2. Run the server: python run.py"
echo ""
echo "The API will be available at http://localhost:8000"
echo "API documentation at http://localhost:8000/docs"
