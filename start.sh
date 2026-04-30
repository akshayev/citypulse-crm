#!/bin/bash
echo "--- DEBUG START ---"
echo "Current Directory: $(pwd)"
echo "Listing files:"
ls -F
echo "Python Path: $PYTHONPATH"
echo "Installing project in editable mode..."
pip install -e .
echo "Starting Uvicorn..."
PYTHONPATH=. uvicorn backend.main:app --host 0.0.0.0 --port $PORT --log-level debug
