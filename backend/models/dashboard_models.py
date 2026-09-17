from pydantic import BaseModel
from typing import List, Optional
from .case_models import Case, SOSEvent, Interaction

class CounsellorQueueResponse(BaseModel):
    queue: List[Case]
    total_cases: int

class CaseDetailResponse(BaseModel):
    case_info: Case
    interactions: List[Interaction]
    active_sos: Optional[SOSEvent] = None
    engagement_profile: dict

class DistrictStats(BaseModel):
    active_cases: int
    critical_alerts: int
    total_counsellors: int
    resolved_today: int

class DistrictDashboardResponse(BaseModel):
    stats: DistrictStats
    recent_cases: List[Case]
    active_sos_events: List[SOSEvent]

class StateStats(BaseModel):
    total_cases: int
    critical_cases: int
    avg_resolution_time_hrs: float

class StateDashboardResponse(BaseModel):
    stats: StateStats
    district_breakdown: List[dict]

class NationalDashboardResponse(BaseModel):
    total_cases_nationwide: int
    state_breakdown: List[dict]
    policy_insights: List[str]
