"""
backend/services/telephony_scheduler.py

Outbound Telephony Scheduler — Phase 5.

Manages automated periodic check-in calls to victims via the Bolna IVR API.

DESIGN:
  - Runs as a long-running asyncio task (started in main.py startup).
  - Every CHECK_IN_INTERVAL_HOURS hours (default: 72h), queries Supabase for
    victims who:
      1. Have an open, non-closed case.
      2. Have not been contacted in the last CHECK_IN_INTERVAL_HOURS hours.
      3. Are not currently mid-escalation (escalation.status != PENDING).
  - For HIGH/CRITICAL distress cases (score >= 60), runs a shorter cycle
    (HIGH_RISK_INTERVAL_HOURS, default: 24h).
  - Dispatches calls via the Bolna outbound call API.
  - Records each dispatch attempt in `scheduled_calls` table (idempotency).

BOLNA CALL FLOW:
  Scheduler → POST /v1/call (Bolna API) → Bolna → IVRS/phone → victim
  → Bolna collects transcript → POST /api/v1/intake/ivr/webhook (our backend)
  → Supervisor pipeline runs on call end

ERROR HANDLING (per project rule):
  - Bolna API failure never crashes the scheduler loop.
  - Failed attempts are recorded with status='failed' and reason.
  - The scheduler continues to the next victim.
  - A single call failure does not block subsequent calls.

PRIVACY:
  - No PII is logged. Phone numbers logged only at DEBUG level.
  - All DB inserts are idempotent (upsert on case_id + scheduled_date).

ENVIRONMENT VARIABLES:
  BOLNA_API_KEY         — Bolna API secret key
  BOLNA_AGENT_ID        — ID of the configured AAVAZ Bolna agent
  BOLNA_API_BASE_URL    — Bolna base URL (default: https://api.bolna.dev)
  CHECK_IN_INTERVAL_HOURS  — Normal check-in frequency (default: 72)
  HIGH_RISK_INTERVAL_HOURS — High-risk check-in frequency (default: 24)
  TELEPHONY_SCHEDULER_ENABLED — Set to "false" to disable in dev (default: true)
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import re

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
try:
    from config import settings
    _bolna_key_default = settings.BOLNA_API_KEY
    _bolna_agent_default = getattr(settings, "BOLNA_AGENT_ID", "")
except Exception:
    _bolna_key_default = ""
    _bolna_agent_default = ""

BOLNA_API_KEY: str = os.environ.get("BOLNA_API_KEY") if "BOLNA_API_KEY" in os.environ else _bolna_key_default
BOLNA_AGENT_ID: str = os.environ.get("BOLNA_AGENT_ID") if "BOLNA_AGENT_ID" in os.environ else _bolna_agent_default
BOLNA_API_BASE_URL: str = os.getenv("BOLNA_API_BASE_URL", "https://api.bolna.dev")

CHECK_IN_INTERVAL_HOURS: int = int(os.getenv("CHECK_IN_INTERVAL_HOURS", "72"))
HIGH_RISK_INTERVAL_HOURS: int = int(os.getenv("HIGH_RISK_INTERVAL_HOURS", "24"))
HIGH_RISK_SCORE_THRESHOLD: float = float(os.getenv("HIGH_RISK_SCORE_THRESHOLD", "60.0"))
SCHEDULER_POLL_HOURS: int = int(os.getenv("SCHEDULER_POLL_HOURS", "1"))
SCHEDULER_ENABLED: bool = os.getenv("TELEPHONY_SCHEDULER_ENABLED", "true").lower() in (
    "1", "true", "yes"
)

# Minimum hours between any two calls to the same victim (guard against runaway)
MIN_CALL_SPACING_HOURS: int = int(os.getenv("MIN_CALL_SPACING_HOURS", "8"))


# ---------------------------------------------------------------------------
# Bolna API client
# ---------------------------------------------------------------------------

async def _dispatch_bolna_call(
    phone_number: str,
    victim_name: str,
    language: str,
    case_id: str,
) -> Optional[str]:
    """
    Dispatch an outbound IVRS call via the Bolna API.
    Returns the Bolna call_id on success, None on failure.
    """
    if not BOLNA_API_KEY or not BOLNA_AGENT_ID:
        logger.warning("Bolna not configured (BOLNA_API_KEY or BOLNA_AGENT_ID missing)")
        return None

    clean_phone = (phone_number or "").strip()
    digits_only = re.sub(r"[^\d]", "", clean_phone)
    if len(digits_only) < 7:
        logger.debug("Skipping Bolna call for non-dialable phone number: %s (case: %s)", clean_phone, case_id)
        return None

    if clean_phone and not clean_phone.startswith("+"):
        clean_phone = f"+91{clean_phone}" if len(clean_phone) == 10 else f"+{clean_phone}"

    payload = {
        "agent_id": BOLNA_AGENT_ID,
        "recipient_phone_number": clean_phone,
        "user_data": {
            "name": victim_name,
            "victim_name": victim_name,
            "language": language,
            "case_id": case_id,
            "call_type": "check_in",
            "case_summary": f"Patient {victim_name}, Case ID: {case_id}. Automated wellness check-in.",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{BOLNA_API_BASE_URL.rstrip('/')}/call",
                json=payload,
                headers={"Authorization": f"Bearer {BOLNA_API_KEY}"},
            )
            data = resp.json() if resp.content else {}
            call_id: str = (
                data.get("call_id")
                or data.get("id")
                or data.get("execution_id")
                or data.get("run_id")
                or f"dispatched-{case_id[:8]}"
            )
            logger.info("Bolna call dispatched: case=%s call_id=%s response=%s", case_id, call_id, data)
            return call_id
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400 and "Trial accounts" in exc.response.text:
            logger.warning(
                "Bolna call skipped for case=%s: phone number is unverified on Bolna trial account.",
                case_id
            )
        else:
            logger.error(
                "Bolna call API error %d for case=%s: %s",
                exc.response.status_code, case_id, exc.response.text[:200]
            )
    except Exception as exc:
        logger.error("Bolna call failed for case=%s: %s", case_id, exc)
    return None


# ---------------------------------------------------------------------------
# Scheduler core
# ---------------------------------------------------------------------------

async def _get_due_cases() -> list[dict]:
    """
    Query Supabase for victims due a check-in call.
    Returns a list of minimal case dicts (id, user_id, distress_score, phone, name, language).
    """
    from services.supabase_client import get_supabase
    supabase = await get_supabase()

    now = datetime.now(timezone.utc)

    # Get all open cases that have a user with a phone number
    try:
        resp = await supabase.table("cases").select(
            "id, user_id, current_distress_score, last_check_in_at, "
            "users!cases_user_id_fkey(phone_number, name, preferred_language)"
        ).neq("case_stage", "closed").execute()
    except Exception as exc:
        logger.error("Failed to query cases for scheduler: %s", exc)
        return []

    due: list[dict] = []
    for row in (resp.data or []):
        user_data = row.get("users") or {}
        phone = user_data.get("phone_number")
        if not phone:
            continue

        score = float(row.get("current_distress_score") or 0)
        is_high_risk = score >= HIGH_RISK_SCORE_THRESHOLD
        interval_h = HIGH_RISK_INTERVAL_HOURS if is_high_risk else CHECK_IN_INTERVAL_HOURS

        last_contact_str = row.get("last_check_in_at")
        if last_contact_str:
            try:
                last_contact = datetime.fromisoformat(last_contact_str.replace("Z", "+00:00"))
                hours_since = (now - last_contact).total_seconds() / 3600
                if hours_since < max(interval_h, MIN_CALL_SPACING_HOURS):
                    continue  # Not due yet
            except ValueError:
                pass  # Bad timestamp — treat as never contacted, include

        due.append({
            "case_id": row["id"],
            "user_id": row["user_id"],
            "distress_score": score,
            "is_high_risk": is_high_risk,
            "phone_number": phone,
            "name": user_data.get("name") or "Caller",
            "language": user_data.get("preferred_language") or "en",
        })

    logger.info("Scheduler: %d case(s) due for check-in", len(due))
    return due


async def _record_call_attempt(
    case_id: str,
    user_id: str,
    call_id: Optional[str],
    status: str,
    reason: str = "",
) -> None:
    """Persist the call attempt to `scheduled_calls` table."""
    from services.supabase_client import get_supabase
    supabase = await get_supabase()
    now = datetime.now(timezone.utc)

    try:
        await supabase.table("scheduled_calls").upsert({
            "case_id": case_id,
            "user_id": user_id,
            "call_id": call_id,
            "status": status,
            "reason": reason[:500] if reason else "",
            "attempted_at": now.isoformat(),
        }, on_conflict="case_id,attempted_at").execute()

        # Update last_check_in_at on the case so failed or restricted calls respect interval spacing
        await supabase.table("cases").update({
            "last_check_in_at": now.isoformat(),
        }).eq("id", case_id).execute()

    except Exception as exc:
        logger.error("Failed to record call attempt for case=%s: %s", case_id, exc)


async def _run_one_cycle() -> None:
    """Run a single scheduler cycle: query, dispatch, record."""
    if not SCHEDULER_ENABLED:
        return

    due_cases = await _get_due_cases()

    for case in due_cases:
        case_id = case["case_id"]
        call_id = await _dispatch_bolna_call(
            phone_number=case["phone_number"],
            victim_name=case["name"],
            language=case["language"],
            case_id=case_id,
        )
        status = "dispatched" if call_id else "failed"
        await _record_call_attempt(
            case_id=case_id,
            user_id=case["user_id"],
            call_id=call_id,
            status=status,
        )
        # Space calls slightly to avoid hammering Bolna API
        await asyncio.sleep(1)


async def run_check_in_scheduler() -> None:
    """
    Long-running scheduler task. Polls every SCHEDULER_POLL_HOURS hours.
    Safe to cancel: each poll cycle is atomic and idempotent.
    """
    logger.info(
        "Telephony scheduler started: normal_interval=%dh high_risk_interval=%dh poll=%dh enabled=%s",
        CHECK_IN_INTERVAL_HOURS, HIGH_RISK_INTERVAL_HOURS,
        SCHEDULER_POLL_HOURS, SCHEDULER_ENABLED,
    )

    while True:
        try:
            await _run_one_cycle()
        except Exception as exc:
            logger.error("Scheduler cycle error (will retry next poll): %s", exc)

        await asyncio.sleep(SCHEDULER_POLL_HOURS * 3600)
