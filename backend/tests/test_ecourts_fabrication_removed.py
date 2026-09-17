"""
Regression tests proving the hardcoded, fabricated legal data previously injected
for the CNR "DLCT110011162019" no longer exists in application behavior, and that
no other realistic-looking CNR was substituted in its place.

Data safety: this file deliberately uses only the known-bad CNR (to prove it's
gone) and an explicitly synthetic identifier ("TEST-CNR-001", which does not match
the real CNR format ^[A-Z]{4}[0-9]{12}$ used elsewhere in the Aavaz spec, so it
cannot be confused with a real one). No realistic-looking fake case data is
introduced anywhere in this file.
"""

import inspect

from services import ecourts_parser
from services.ecourts_parser import parse_unstructured_case_data

FABRICATED_CNR = "DLCT110011162019"
SYNTHETIC_TEST_CNR = "TEST-CNR-001"

# Specific fabricated content that must never appear in the parsing source again.
FABRICATED_MARKERS = [
    FABRICATED_CNR,
    "SPECIAL JUDGE PC ACT CBI-01",
    "Intra-establishment transfer",
    "The Prevention of Corruption Act 1988 - Sections 13(2), 13(1)(d)",
]


def test_fabricated_cnr_not_hardcoded_in_source():
    source = inspect.getsource(ecourts_parser)
    assert FABRICATED_CNR not in source, (
        "The fabricated CNR is still referenced in ecourts_parser.py source"
    )


def test_no_conditional_branch_keyed_on_the_fabricated_cnr():
    source = inspect.getsource(ecourts_parser.parse_unstructured_case_data)
    assert "if cnr ==" not in source, (
        "parse_unstructured_case_data still special-cases on a specific CNR value"
    )


def test_fabricated_legal_facts_not_present_in_source():
    source = inspect.getsource(ecourts_parser)
    still_present = [marker for marker in FABRICATED_MARKERS if marker in source]
    assert still_present == [], f"Fabricated content still present in source: {still_present}"


async def test_fabricated_cnr_no_longer_triggers_unconditional_injection(monkeypatch):
    """
    With no GROQ_API_KEY configured (the test-environment default), the function's
    only remaining behavior is to return raw_data unchanged. Previously, querying
    the fabricated CNR unconditionally mutated raw_data with fake facts before this
    point was ever reached. This proves that no longer happens for any input shape.
    """
    monkeypatch.setattr(ecourts_parser.settings, "GROQ_API_KEY", "")

    raw_data = {}
    result = await parse_unstructured_case_data(FABRICATED_CNR, raw_data)

    assert result == {}, "The fabricated CNR still mutates raw_data unconditionally"
    for marker in FABRICATED_MARKERS:
        assert marker not in str(result)


async def test_synthetic_cnr_behaves_identically_to_the_formerly_fabricated_one(monkeypatch):
    """
    No CNR value gets special treatment any more — a known-bad value and a
    clearly synthetic fixture value must produce identical (unchanged) output.
    """
    monkeypatch.setattr(ecourts_parser.settings, "GROQ_API_KEY", "")

    raw_data_a = {"caseType": "UNKNOWN"}
    raw_data_b = {"caseType": "UNKNOWN"}

    result_fabricated_cnr = await parse_unstructured_case_data(FABRICATED_CNR, raw_data_a)
    result_synthetic_cnr = await parse_unstructured_case_data(SYNTHETIC_TEST_CNR, raw_data_b)

    assert result_fabricated_cnr == result_synthetic_cnr == {"caseType": "UNKNOWN"}


def test_no_new_hardcoded_realistic_cnr_introduced():
    """
    Guards against "fixing" this by swapping in a different specific, realistic-
    looking CNR literal instead of removing the special-casing entirely. Any CNR
    literal appearing in this source file must be the explicitly synthetic test
    fixture format, not something matching the real CNR pattern
    ^[A-Z]{4}[0-9]{12}$.
    """
    import re

    source = inspect.getsource(ecourts_parser)
    real_cnr_pattern = re.compile(r"\b[A-Z]{4}[0-9]{12}\b")
    matches = real_cnr_pattern.findall(source)
    assert matches == [], f"A real-looking CNR literal was found in source: {matches}"
