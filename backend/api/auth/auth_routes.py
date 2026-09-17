from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import json
import os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class LoginRequest(BaseModel):
    username: str
    password: str

class OTPVerifyRequest(BaseModel):
    phone_number: str

@router.post("/verify_otp")
async def verify_otp(payload: OTPVerifyRequest):
    """
    MVP Mock for OTP verification.
    Checks if a user exists with this phone number.
    Returns whether they are a new user.
    """
    from services.supabase_client import get_supabase
    supabase = await get_supabase()
    
    resp = await supabase.table("users").select("*").eq("phone_number", payload.phone_number).execute()
    
    if resp.data and len(resp.data) > 0:
        return {
            "status": "success",
            "is_new_user": False,
            "userProfile": resp.data[0]
        }
    else:
        return {
            "status": "success",
            "is_new_user": True,
            "userProfile": None
        }

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
        auth_resp = supabase.auth.sign_in_with_password({
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
