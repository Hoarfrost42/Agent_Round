@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_EXE="
if exist "%~dp0venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"

%PYTHON_EXE% start.py

endlocal
