from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
import asyncio
from config import settings

# Fix for Playwright NotImplementedError on Windows with FastAPI
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

app = FastAPI(
    title="Mental Health Monitoring API",
    version="1.0.0",
    description="API for SIH 26094 Distress Prediction System"
)

# CORS middleware for dashboards and mobile app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": app.version}

from api.intake import app_routes, ivr_webhook, sms_webhook, chatbot_routes
from api.cases import sos_routes, case_routes, lifecycle_routes, ecourts_routes, report_routes
from api.dashboards import district_routes, counsellor_routes, state_routes, national_routes, superadmin_routes
from api.auth import auth_routes
from api.assignment.escalation import check_and_escalate_sos
import asyncio

@app.on_event("startup")
async def startup_event():
    # Start the background escalation engine
    asyncio.create_task(check_and_escalate_sos())

@app.on_event("shutdown")
async def shutdown_event():
    pass

app.include_router(auth_routes.router, prefix="/api/v1/auth", tags=["auth"])

app.include_router(app_routes.router, prefix="/api/v1/intake/app", tags=["intake", "app"])
app.include_router(chatbot_routes.router, prefix="/api/v1/intake/chatbot", tags=["intake", "chatbot"])
app.include_router(ivr_webhook.router, prefix="/api/v1/intake/ivr", tags=["intake", "ivr"])
app.include_router(sms_webhook.router, prefix="/api/v1/intake/sms", tags=["intake", "sms"])

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

