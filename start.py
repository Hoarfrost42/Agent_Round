"""One-click launcher for the AgentRound backend."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

import httpx


def _kill_existing_uvicorn() -> None:
    """Terminate ALL existing uvicorn processes running backend.main:app."""

    try:
        output = subprocess.check_output(
            [
                "wmic",
                "process",
                "where",
                "CommandLine like '%backend.main:app%'",
                "get",
                "ProcessId,CommandLine",
            ],
            text=True,
            errors="ignore",
        )
    except Exception:
        return

    for line in output.splitlines():
        line = line.strip()
        if not line or "ProcessId" in line:
            continue
        parts = line.split()
        pid = parts[-1] if parts else ""
        if pid.isdigit():
            subprocess.run(
                ["taskkill", "/PID", pid, "/F", "/T"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            print(f"Killed existing uvicorn process (PID: {pid})")


def _kill_port_range(start_port: int = 8000, end_port: int = 8010) -> None:
    """Kill any process listening on ports in the given range."""

    try:
        output = subprocess.check_output(["netstat", "-ano"], text=True, errors="ignore")
    except Exception:
        return

    pids: set[str] = set()
    for port in range(start_port, end_port + 1):
        needle = f":{port} "
        for line in output.splitlines():
            if needle not in line:
                continue
            if "LISTENING" not in line:
                continue
            parts = [part for part in line.split() if part]
            if parts:
                pid = parts[-1]
                if pid.isdigit() and pid != "0":
                    pids.add(pid)

    for pid in pids:
        subprocess.run(
            ["taskkill", "/PID", pid, "/F", "/T"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    
    if pids:
        print(f"Cleared {len(pids)} process(es) from port range {start_port}-{end_port}")
        # Wait for ports to be released, with verification
        print("Waiting for ports to be released...", end=" ", flush=True)
        for attempt in range(10):  # Max 5 seconds
            time.sleep(0.5)
            # Check if preferred port is free
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                try:
                    sock.bind(("127.0.0.1", start_port))
                    print("done.")
                    return
                except OSError:
                    print(".", end="", flush=True)
        print(" (timeout, will use fallback port)")


def _resolve_python() -> list[str]:
    """Return the Python executable command."""

    root = Path(__file__).resolve().parent
    venv_python = root / "venv" / "Scripts" / "python.exe"
    if venv_python.exists():
        return [str(venv_python)]
    return [sys.executable or "python"]


def _ensure_dependencies(python_cmd: list[str]) -> None:
    """Install backend dependencies if uvicorn is missing."""

    check = subprocess.run(
        python_cmd + ["-m", "pip", "show", "uvicorn"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if check.returncode != 0:
        subprocess.check_call(python_cmd + ["-m", "pip", "install", "-r", "backend/requirements.txt"])


def _start_backend(python_cmd: list[str], port: int) -> subprocess.Popen[str]:
    """Start the backend server."""

    reload_enabled = (os.getenv("ENABLE_RELOAD", "0").strip() == "1")
    args = ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(port)]
    if reload_enabled:
        args.append("--reload")
    return subprocess.Popen(
        python_cmd + args,
        cwd=Path(__file__).resolve().parent,
    )


def _wait_for_server(url: str, timeout_seconds: int = 30) -> bool:
    """Wait until the backend responds."""

    start_time = time.time()
    with httpx.Client(timeout=1.0, trust_env=False) as client:
        while time.time() - start_time < timeout_seconds:
            try:
                response = client.get(url)
                if response.status_code == 200:
                    return True
            except Exception:
                time.sleep(1)
    return False


def _is_port_listening(port: int) -> bool:
    """Return True if the port is currently in LISTENING state."""

    try:
        output = subprocess.check_output(["netstat", "-ano"], text=True, errors="ignore")
    except Exception:
        return False
    needle = f":{port} "
    for line in output.splitlines():
        if "LISTENING" in line and needle in line:
            return True
    return False


def _is_port_free(port: int) -> bool:
    """Return True if a TCP port is available on localhost."""

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        if sock.connect_ex(("127.0.0.1", port)) == 0:
            return False
    if _is_port_listening(port):
        return False
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _pick_port(start_port: int = 8000, max_port: int = 8010) -> int:
    """Pick an available port from a range."""

    for port in range(start_port, max_port + 1):
        if _is_port_free(port):
            return port
    return start_port


def main() -> int:
    """Launch backend and open browser."""

    preferred_port = int(os.getenv("PORT", "8000"))
    
    print("Cleaning up existing processes...")
    _kill_existing_uvicorn()
    _kill_port_range(preferred_port, preferred_port + 10)
    
    python_cmd = _resolve_python()
    _ensure_dependencies(python_cmd)
    
    port = _pick_port(preferred_port, preferred_port + 10)
    if port != preferred_port:
        print(f"Port {preferred_port} is busy, using {port} instead.")
    _start_backend(python_cmd, port)
    url = f"http://127.0.0.1:{port}/"
    ready = _wait_for_server(f"{url}api/health")
    webbrowser.open(url)
    if ready:
        return 0
    print(f"Backend did not become ready in time. Open {url} manually.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
