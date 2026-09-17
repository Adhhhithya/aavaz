from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import logging

from models.intake_models import OtpRequestPayload, OtpVerifyPayload
from services import otp_service
from api.auth.victim_dependencies import (
    issue_phone_verified_token,
    issue_victim_session_token,
    resolve_victim_by_phone,
)

router = APIRouter()
logger = logging.getLogger(__name__)

class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/otp/request")
async def request_otp(payload: OtpRequestPayload, request: Request):
    """
    Real victim OTP issuance (S2). Generates a cryptographically random 6-digit
    code, stores only its salted hash (see services/otp_service.py), and
    dispatches it through the configured provider (synthetic in development,
    Pushbullet otherwise). Never returns the code in the HTTP response.
    """
    client_ip = request.client.host if request.client else None
    try:
        await otp_service.request_otp(payload.phone_number, ip_address=client_ip)
    except otp_service.RateLimitedError:
        # Deliberately generic + same status for both phone- and IP-based limits,
        # so a caller can't distinguish which counter they hit.
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please try again later.")
    except RuntimeError as e:
        # Misconfiguration (no pepper/provider outside development) — this is an
        # operator error, not something to leak in detail to a caller.
        logger.error(f"OTP request failed due to configuration error: {e}")
        raise HTTPException(status_code=503, detail="OTP service is not available")

    return {"status": "sent"}


@router.post("/otp/verify")
async def verify_otp(payload: OtpVerifyPayload):
    """
    Real OTP verification (S2). Compares the submitted code against server-side
    state (constant-time), consumes it on success, and issues one of two
    short-lived tokens depending on whether this phone already has a `users` row:

    - an existing victim gets a full victim session token (role="victim").
    - a new phone gets a phone-verified token, which only authorizes a
      subsequent call to POST /api/v1/intake/app/register — it is not a session.
    """
    try:
        await otp_service.verify_otp(payload.phone_number, payload.code)
    except otp_service.ExpiredOtpError:
        raise HTTPException(status_code=401, detail="Invalid or expired code")
    except otp_service.InvalidOtpError:
        raise HTTPException(status_code=401, detail="Invalid or expired code")
    except RuntimeError as e:
        logger.error(f"OTP verify failed due to configuration error: {e}")
        raise HTTPException(status_code=503, detail="OTP service is not available")

    existing_user = await resolve_victim_by_phone(payload.phone_number)
    if existing_user:
        token = issue_victim_session_token(existing_user["id"], payload.phone_number)
        return {
            "status": "success",
            "is_new_user": False,
            "token": token,
            "token_type": "victim_session",
            "userProfile": existing_user,
        }

    token = issue_phone_verified_token(payload.phone_number)
    return {"status": "success", "is_new_user": True, "token": token, "token_type": "phone_verified"}

@router.post("/login")
async def login(payload: LoginRequest):
    """
    Prod Auth endpoint hitting Supabase Auth.
    """
    logger.info(f"Login attempt for {payload.username}")
    
    from services.supabase_client import get_supabase
    supabase = await get_supabase()
    
    try:
        # Assuming username is mapped to an email in Supabase Auth (e.g. username@sih.gov.in)
        email = f"{payload.username}@sih.gov.in" if "@" not in payload.username else payload.username
        
        # 1. Authenticate with Supabase
        # NOTE: sign_in_with_password is a coroutine on the async client; the missing
        # `await` here previously meant this always failed (auth_resp was a coroutine
        # object, not an AuthResponse), silently reported as "Invalid credentials or
        # Auth error" below. Fixed as part of the authorization remediation pass since
        # the new staff-only dashboard/admin authorization depends on this login path
        # actually working.
        auth_resp = await supabase.auth.sign_in_with_password({
            "email": email,
            "password": payload.password
        })
        
        if not auth_resp.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
            
        # 2. Fetch user's role from the users table using their auth.uid
        user_record = await supabase.table("users").select("*").eq("id", auth_resp.user.id).execute()
        
        if not user_record.data:
            # Fallback for staff who might not have a profile yet
            role = "counsellor"
            name = payload.username
        else:
            role = user_record.data[0].get("role_type", "counsellor")
            name = user_record.data[0].get("name", payload.username)
            
        return {
            "access_token": auth_resp.session.access_token,
            "user": {
                "id": auth_resp.user.id,
                "username": payload.username,
                "role": role,
                "name": name
            }
        }
        
    except Exception as e:
        logger.error(f"Supabase Auth Failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid credentials or Auth error")
