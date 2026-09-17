"""
A minimal in-memory fake of the subset of the Supabase/postgrest async query
builder that services/otp_service.py actually uses (select/insert/update with
eq/gte/is_/order/limit, all async .execute()).

This is NOT a general-purpose Supabase mock — it exists specifically so
OTP generation/hashing/expiry/attempt-limiting logic can be exercised for real
(actual comparisons against actual stored, hashed state) without a live Supabase
project. Every assertion in test_otp_service.py is checking real otp_service.py
code paths against this fake's stored rows, not against a rewritten/simplified
copy of the logic.
"""

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace


class FakeTable:
    def __init__(self, store, name):
        self._store = store
        self._name = name
        self._rows = store.setdefault(name, [])
        self._filters = []
        self._order_col = None
        self._order_desc = False
        self._limit_n = None
        self._mode = None
        self._payload = None
        self._want_single = False

    # -- filters (chainable, mimic the real builder's self-return pattern) --
    def select(self, *_args, **_kwargs):
        self._mode = "select"
        return self

    def insert(self, payload):
        self._mode = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._mode = "update"
        self._payload = payload
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def gte(self, col, val):
        self._filters.append(("gte", col, val))
        return self

    def is_(self, col, val):
        self._filters.append(("is", col, val))
        return self

    def order(self, col, desc=False):
        self._order_col = col
        self._order_desc = desc
        return self

    def limit(self, n):
        self._limit_n = n
        return self

    def single(self):
        self._want_single = True
        return self

    def _matches(self, row):
        for kind, col, val in self._filters:
            if kind == "eq" and row.get(col) != val:
                return False
            if kind == "gte" and (row.get(col) is None or row.get(col) < val):
                return False
            if kind == "is":
                is_null = row.get(col) is None
                if val == "null" and not is_null:
                    return False
                if val != "null" and is_null:
                    return False
        return True

    async def execute(self):
        if self._mode == "insert":
            row = dict(self._payload)
            row.setdefault("id", str(uuid.uuid4()))
            # Mimic the real schema's `created_at TIMESTAMPTZ DEFAULT NOW()` —
            # otp_service.py deliberately doesn't set this itself, matching the
            # real table, so the fake must supply it the same way Postgres does.
            row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
            self._rows.append(row)
            return SimpleNamespace(data=[row])

        if self._mode == "update":
            matched = [r for r in self._rows if self._matches(r)]
            for r in matched:
                r.update(self._payload)
            return SimpleNamespace(data=matched)

        # select
        matched = [r for r in self._rows if self._matches(r)]
        if self._order_col:
            matched.sort(key=lambda r: r.get(self._order_col), reverse=self._order_desc)
        if self._limit_n is not None:
            matched = matched[: self._limit_n]

        if self._want_single:
            # Mirrors real postgrest .single() behavior closely enough for
            # tests: .data is the single dict, not a list.
            if len(matched) != 1:
                raise ValueError(f"Expected exactly one row, found {len(matched)}")
            return SimpleNamespace(data=matched[0])

        return SimpleNamespace(data=matched)


class FakeSupabaseClient:
    """In-memory store shared across all `.table(...)` calls on one instance."""

    def __init__(self):
        self._store = {}

    def table(self, name):
        return FakeTable(self._store, name)
