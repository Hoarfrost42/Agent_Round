"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
import os
import signal
import time
from datetime import datetime, timezone

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.api.routes import providers as providers_routes
from backend.api.routes import sessions as sessions_routes
from backend.api.routes import templates as templates_routes
from backend.api.schemas import HealthResponse
from backend.config.settings import load_settings
from backend.providers.registry import get_provider_registry
from backend.storage.store_factory import get_session_store


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    settings = load_settings()
    app = FastAPI(title="AgentRound Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def startup_event() -> None:
        """Load providers at startup."""

        settings.data_dir.mkdir(parents=True, exist_ok=True)
        registry = get_provider_registry()
        registry.load()
        get_session_store()
        logger.info("Loaded %s providers", len(registry.list_configs()))

    @app.get("/api/health", response_model=HealthResponse)
    async def health_check() -> HealthResponse:
        """Return service health status."""

        return HealthResponse(status="ok", timestamp=datetime.now(timezone.utc))

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon() -> RedirectResponse:
        """Redirect favicon requests to the frontend asset."""

        return RedirectResponse(url="/favicon.svg")

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        """Serve the frontend index page explicitly."""

        index_file = settings.frontend_dir / "index.html"
        if not index_file.exists():
            raise HTTPException(status_code=404, detail="index.html not found")
        return FileResponse(index_file)

    @app.post("/api/shutdown")
    async def shutdown(background_tasks: BackgroundTasks) -> dict[str, str]:
        """Request a graceful shutdown of the server."""

        def request_shutdown() -> None:
            time.sleep(0.2)
            try:
                signal.raise_signal(signal.SIGINT)
            except Exception:
                os.kill(os.getpid(), signal.SIGTERM)

        background_tasks.add_task(request_shutdown)
        return {"status": "shutting_down"}

    app.include_router(providers_routes.router)
    app.include_router(sessions_routes.router)
    app.include_router(templates_routes.router)
    logger.info("Registered templates router at /api/templates")

    if settings.frontend_dir.exists():
        app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")

    return app


app = create_app()
