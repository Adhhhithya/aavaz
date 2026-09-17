import os
import sys

# The application modules (main, config, api.*, services.*) use absolute imports
# assuming `backend/` itself is on sys.path (that's how main.py/run_server.py are
# normally run). Make that true for pytest regardless of invocation directory.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Force a predictable, safe settings baseline for every test run: no real Supabase/LLM
# credentials, explicit non-development ENVIRONMENT unless a specific test overrides it.
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("GROQ_API_KEY", "")
os.environ.setdefault("ENVIRONMENT", "development")
