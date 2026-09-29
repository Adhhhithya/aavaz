from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sys
import os
import asyncio
from config import settings

# Fix for Playwright NotImplementedError on Windows with FastAPI
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from core.logging import setup_logging
setup_logging()

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    asyncio.create_task(check_and_escalate_sos())
    asyncio.create_task(run_check_in_scheduler())
    if settings.PUSHBULLET_API_KEY:
        from services.pushbullet_service import start_pushbullet_sms_listener, stop_pushbullet_sms_listener
        from services.sms_intake_service import process_incoming_sms
        start_pushbullet_sms_listener(callback=process_incoming_sms)
    yield
    # Shutdown
    if settings.PUSHBULLET_API_KEY:
        stop_pushbullet_sms_listener()

app = FastAPI(
    title="Mental Health Monitoring API",
    version="1.0.0",
    description="API for SIH 26094 Distress Prediction System",
    lifespan=lifespan
)

# CORS middleware for dashboards and mobile app
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

from api.middleware.correlation import CorrelationIdMiddleware
app.add_middleware(CorrelationIdMiddleware)

from api import health_routes
app.include_router(health_routes.router, tags=["health"])

from api.intake import app_routes, ivr_webhook, sms_webhook, chatbot_routes, voice_routes
from api.cases import sos_routes, case_routes, lifecycle_routes, ecourts_routes, report_routes
from api.dashboards import district_routes, counsellor_routes, state_routes, national_routes, superadmin_routes, rit_routes
from api.auth import auth_routes
from api.assignment.escalation import check_and_escalate_sos
from services.telephony_scheduler import run_check_in_scheduler
import asyncio



app.include_router(auth_routes.router, prefix="/api/v1/auth", tags=["auth"])

app.include_router(app_routes.router, prefix="/api/v1/intake/app", tags=["intake", "app"])
app.include_router(chatbot_routes.router, prefix="/api/v1/intake/chatbot", tags=["intake", "chatbot"])
app.include_router(ivr_webhook.router, prefix="/api/v1/intake/ivr", tags=["intake", "ivr"])
app.include_router(sms_webhook.router, prefix="/api/v1/intake/sms", tags=["intake", "sms"])
app.include_router(voice_routes.router, prefix="/api/v1/intake/voice", tags=["intake", "voice"])

app.include_router(sos_routes.router, prefix="/api/v1/cases/sos", tags=["cases", "sos"])
app.include_router(case_routes.router, prefix="/api/v1/cases", tags=["cases", "progress"])
app.include_router(lifecycle_routes.router, prefix="/api/v1/cases", tags=["cases", "lifecycle"])
app.include_router(ecourts_routes.router, prefix="/api/v1/ecourts", tags=["cases", "ecourts"])
app.include_router(report_routes.router, prefix="/api/v1/cases", tags=["cases", "reports"])

app.include_router(counsellor_routes.router, prefix="/api/v1/dashboards/counsellor", tags=["dashboards", "counsellor"])
app.include_router(district_routes.router, prefix="/api/v1/dashboards", tags=["dashboards", "district"])
app.include_router(state_routes.router, prefix="/api/v1/dashboards/state", tags=["dashboards", "state"])
app.include_router(national_routes.router, prefix="/api/v1/dashboards/national", tags=["dashboards", "national"])
app.include_router(superadmin_routes.router, prefix="/api/v1/dashboards/superadmin", tags=["dashboards", "superadmin"])
app.include_router(rit_routes.router, prefix="/rit", tags=["superadmin", "rit"])

# --- Frontend Web Serving (Single-Port Hosting for Dashboards & API) ---
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
FRONTEND_ASSETS = os.path.join(FRONTEND_DIST, "assets")

if os.path.isdir(FRONTEND_ASSETS):
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS), name="frontend_assets")

from fastapi import Request

@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"], include_in_schema=False)
async def serve_spa(full_path: str, request: Request):
    # Do not intercept API, RIT, health, docs, or schema endpoints
    if (
        full_path.startswith("api/")
        or full_path == "api"
        or full_path.startswith("rit")
        or full_path == "rit"
        or full_path.startswith("health")
        or full_path in ("docs", "redoc", "openapi.json")
    ):
        raise HTTPException(status_code=404, detail="Not Found")

    if request.method not in ("GET", "HEAD"):
        raise HTTPException(status_code=405, detail="Method Not Allowed")

    # If an exact static file exists in frontend/dist (e.g. favicon.svg, icons.svg), serve it
    static_file = os.path.join(FRONTEND_DIST, full_path)
    if full_path and os.path.isfile(static_file):
        return FileResponse(static_file)

    # Fallback to SPA index.html for React Router
    index_file = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)

    return {"message": "Frontend not built. Run 'npm run build' inside frontend directory."}


