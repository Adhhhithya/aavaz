"""
backend/scripts/seed_legal_knowledge.py

Seeds the `legal_documents` table in Supabase with official SC/ST
(Prevention of Atrocities) Act provisions, compensation schedules,
legal aid rights, and welfare scheme eligibility.

All content is sourced from publicly available government documents:
  - The Scheduled Castes and Scheduled Tribes (Prevention of Atrocities)
    Act, 1989 (as amended 2015)
  - The Scheduled Castes and Scheduled Tribes (Prevention of Atrocities)
    Rules, 1995 (as amended 2016)
  - Ministry of Social Justice and Empowerment (MoSJE) guidance documents

Run from the backend directory:
    python scripts/seed_legal_knowledge.py

IMPORTANT: This script is idempotent - it checks for existing entries
by source+title before inserting to avoid duplicates.
"""
from __future__ import annotations

import asyncio
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Legal knowledge corpus
# Source: SC/ST PoA Act 1989 (amended 2015), Rules 1995 (amended 2016)
# ---------------------------------------------------------------------------
LEGAL_CORPUS: list[dict] = [

    # -------------------------------------------------------------------------
    # Compensation (Schedule I / Rule 12(4))
    # -------------------------------------------------------------------------
    {
        "source": "SC/ST PoA Rules 1995, Schedule I, Rule 12(4)",
        "title": "Compensation for SC/ST Atrocity Victims - Schedule I",
        "category": "compensation",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Under the Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) "
            "Rules, 1995, Schedule I specifies mandatory compensation for atrocity victims. "
            "Relief is payable by the State Government within specific timelines:\n\n"
            "- Murder / death: Rs 8,50,000 (85% advance within 3 months of FIR)\n"
            "- Grievous injury: Rs 2,00,000 (75% advance within 1 month)\n"
            "- Rape: Rs 3,00,000 (75% advance, 50% within 7 days of incident)\n"
            "  Additional Rs 2,00,000 for gang rape.\n"
            "- Destruction of property: up to Rs 2,50,000 (replacement value)\n"
            "- Wrongful occupation of land: Rs 2,00,000 (pending restoration)\n"
            "- Socially boycotted / ostracised: Rs 1,00,000\n\n"
            "Payment is separate from any criminal compensation ordered by a court. "
            "Victims do not need to wait for conviction to receive relief under the Rules."
        ),
        "metadata": {"act_section": "Rule 12(4)", "last_amended": "2016"},
    },
    {
        "source": "SC/ST PoA Rules 1995, Rule 12(4)(e)",
        "title": "Compensation Disbursement Timeline Requirements",
        "category": "compensation",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Rule 12(4)(e) mandates that relief and compensation must be disbursed "
            "as follows by the District Magistrate (DM) or Sub-Divisional Magistrate (SDM):\n\n"
            "- 50% of total compensation must be released at the time of registration of FIR, "
            "  for rape and sexual assault offences.\n"
            "- 75% of total compensation must be released within 1 month of filing the FIR "
            "  for other offences.\n"
            "- Remaining 25% is released on sentencing of the accused.\n\n"
            "The victim should contact the district Nodal Officer under the Act if payment "
            "is delayed. Delay in payment is itself a violation of the Rules."
        ),
        "metadata": {"act_section": "Rule 12(4)(e)", "last_amended": "2016"},
    },

    # -------------------------------------------------------------------------
    # Legal Aid Rights
    # -------------------------------------------------------------------------
    {
        "source": "SC/ST PoA Act 1989, Section 15A, Legal Services Authorities Act 1987",
        "title": "Right to Free Legal Aid for SC/ST Atrocity Victims",
        "category": "legal_rights",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Every victim or witness of an offence under the SC/ST (Prevention of Atrocities) "
            "Act, 1989 has the following rights under Section 15A:\n\n"
            "1. Right to be informed about their rights at every stage of the investigation "
            "   and trial.\n"
            "2. Right to be provided a government-appointed advocate free of cost through the "
            "   District Legal Services Authority (DLSA).\n"
            "3. Right to reasonable expenses for travel, food, and accommodation to attend "
            "   court.\n"
            "4. Right to be kept informed of the progress of the investigation.\n"
            "5. Right to nominate a person to receive notices and information on their behalf.\n\n"
            "To access free legal aid, the victim or their family should contact:\n"
            "- The nearest District Legal Services Authority (DLSA)\n"
            "- The State Legal Services Authority (SLSA)\n"
            "- Their assigned case Nodal Officer under the SC/ST Act"
        ),
        "metadata": {"act_section": "15A", "last_amended": "2015"},
    },
    {
        "source": "SC/ST PoA Act 1989, Section 15A(5)",
        "title": "Witness Protection Rights Under SC/ST Act",
        "category": "legal_rights",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Section 15A(5) of the SC/ST (Prevention of Atrocities) Act, 1989 grants "
            "witnesses in atrocity cases specific protections:\n\n"
            "- The State Government must provide reasonable protection to witnesses "
            "  who may be at risk of intimidation, threats, or harm.\n"
            "- Witnesses may apply to the District Magistrate (DM) for protection. "
            "  The DM is empowered to direct police protection, relocation support, "
            "  or identity concealment.\n"
            "- Intimidation of a witness in an SC/ST atrocity case is itself an offence "
            "  punishable under the Act.\n\n"
            "If you believe you are being threatened or intimidated as a witness, "
            "contact your assigned counsellor immediately, use the in-app SOS function, "
            "or call India's emergency number 112."
        ),
        "metadata": {"act_section": "15A(5)", "last_amended": "2015"},
    },

    # -------------------------------------------------------------------------
    # Welfare Schemes & Rehabilitation
    # -------------------------------------------------------------------------
    {
        "source": "SC/ST PoA Rules 1995, Rule 12(4)(f)-(j)",
        "title": "Rehabilitation Support for SC/ST Atrocity Victims",
        "category": "rehabilitation",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Under Rules 12(4)(f)-(j), the following rehabilitation measures must be "
            "provided to victims of atrocities under the SC/ST Act:\n\n"
            "- Medical aid and hospitalisation: Full cost covered by the State.\n"
            "- Temporary shelter: If the victim cannot safely return home due to ongoing "
            "  threat, temporary accommodation must be arranged by the district administration.\n"
            "- Livelihood support: For victims who have lost income due to the atrocity, "
            "  the State must provide interim monthly financial assistance.\n"
            "- Restoration of land: If the victim was illegally dispossessed of their "
            "  land or property, the district administration must restore it.\n"
            "- Socio-economic rehabilitation: Vocational training, housing assistance, "
            "  and income-generation support where applicable.\n\n"
            "These are entitlements, not discretionary grants. The victim's assigned "
            "counsellor or the district Nodal Officer can facilitate access."
        ),
        "metadata": {"act_section": "Rule 12(4)(f)-(j)", "last_amended": "2016"},
    },

    # -------------------------------------------------------------------------
    # Legal Procedures
    # -------------------------------------------------------------------------
    {
        "source": "SC/ST PoA Act 1989, Section 14, Special Courts",
        "title": "Special Courts for SC/ST Atrocity Cases",
        "category": "legal_procedure",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Section 14 of the SC/ST (Prevention of Atrocities) Act, 1989 requires:\n\n"
            "- Every State must establish Exclusive Special Courts (ESC) for trial of "
            "  offences under the Act.\n"
            "- Cases under the Act cannot be tried by any ordinary magistrate court.\n"
            "- An Exclusive Special Court must complete the trial within 2 months of "
            "  filing the chargesheet (Section 14A, added 2015 amendment).\n"
            "- A Special Public Prosecutor must be appointed by the State Government "
            "  for each Exclusive Special Court.\n\n"
            "Delays in trial beyond 2 months can be raised with the High Court. "
            "The victim's advocate (provided free under Section 15A) can file a "
            "petition for expedited trial."
        ),
        "metadata": {"act_section": "14, 14A", "last_amended": "2015"},
    },
    {
        "source": "SC/ST PoA Act 1989, Section 4, Non-registration of FIR",
        "title": "Duties of Police and Consequences of Non-Registration",
        "category": "legal_procedure",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Under Section 4 of the SC/ST (Prevention of Atrocities) Act, 1989:\n\n"
            "- Any public servant who wilfully neglects their duties required under the "
            "  Act is punishable with imprisonment of 6 months to 1 year.\n"
            "- A police officer who refuses to register an FIR for an offence under "
            "  the Act is committing an offence themselves.\n\n"
            "If an FIR is refused:\n"
            "1. File a written complaint with the Superintendent of Police (SP).\n"
            "2. File a complaint directly with the District Magistrate (DM).\n"
            "3. Approach the State SC/ST Commission.\n"
            "4. File a complaint with the National Commission for Scheduled Castes "
            "   (NCSC) or National Commission for Scheduled Tribes (NCST).\n\n"
            "The victim does not need any preliminary evidence to have an FIR registered. "
            "Their statement is sufficient."
        ),
        "metadata": {"act_section": "4", "last_amended": "2015"},
    },

    # -------------------------------------------------------------------------
    # Emergency Contact Information
    # -------------------------------------------------------------------------
    {
        "source": "Government of India, Emergency Services",
        "title": "Emergency Contact Numbers for Atrocity Victims",
        "category": "emergency_contact",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Official emergency contacts available to SC/ST atrocity victims in India:\n\n"
            "- National Emergency Number: 112 (Police, Fire, Ambulance - available 24x7)\n"
            "- SC/ST Atrocity Helpline (NHAA): 14566 (Ministry of Social Justice & Empowerment)\n"
            "- National Commission for Scheduled Castes (NCSC): 011-23388328\n"
            "- National Commission for Scheduled Tribes (NCST): 011-26107600\n\n"
            "Within the AAVAZ system:\n"
            "- Use the in-app SOS button to immediately alert your assigned counsellor "
            "  with your GPS location.\n"
            "- For medical emergency, call 112 first, then use the SOS button.\n\n"
            "IMPORTANT: Only contact numbers listed here should be shared with victims. "
            "Any other helpline number not on this list has not been verified as current."
        ),
        "metadata": {"verified_date": "2024"},
    },
    {
        "source": "Legal Services Authorities Act 1987, DLSA Directory",
        "title": "District Legal Services Authority (DLSA) - Legal Aid Access",
        "category": "emergency_contact",
        "jurisdiction": "IN",
        "language": "en",
        "content": (
            "Free legal aid is available through District Legal Services Authorities (DLSA). "
            "To access free legal aid for an SC/ST atrocity case:\n\n"
            "1. Visit the nearest District Court complex and find the DLSA office.\n"
            "2. State that you are a victim or witness under the SC/ST (Prevention of "
            "   Atrocities) Act, 1989 and require a free advocate.\n"
            "3. You are entitled to free legal aid regardless of income (victims of "
            "   serious offences are entitled automatically under Section 12 of the "
            "   Legal Services Authorities Act, 1987).\n"
            "4. National Legal Services Authority (NALSA) Helpline: 15100\n\n"
            "Your assigned counsellor through the AAVAZ system can also help you "
            "contact the DLSA and accompany you if needed."
        ),
        "metadata": {"source_act": "Legal Services Authorities Act 1987"},
    },

    # -------------------------------------------------------------------------
    # Hindi translations (critical documents)
    # -------------------------------------------------------------------------
    {
        "source": "SC/ST PoA Rules 1995, Schedule I, Rule 12(4) [Hindi]",
        "title": "अनुसूचित जाति/जनजाति अत्याचार पीड़ितों को मुआवजा - अनुसूची I",
        "category": "compensation",
        "jurisdiction": "IN",
        "language": "hi",
        "content": (
            "अनुसूचित जातियों और अनुसूचित जनजातियों (अत्याचार निवारण) नियम 1995 के तहत "
            "अनुसूची I में पीड़ितों को अनिवार्य मुआवजे का प्रावधान है:\n\n"
            "- हत्या/मृत्यु: 8,50,000 रुपये (FIR दर्ज होने के 3 माह के भीतर 85% अग्रिम)\n"
            "- गंभीर चोट: 2,00,000 रुपये (1 माह के भीतर 75% अग्रिम)\n"
            "- बलात्कार: 3,00,000 रुपये (घटना के 7 दिनों के भीतर 50% अग्रिम)\n"
            "- सामूहिक बलात्कार: अतिरिक्त 2,00,000 रुपये\n"
            "- संपत्ति का विनाश: 2,50,000 रुपये तक\n"
            "- सामाजिक बहिष्कार: 1,00,000 रुपये\n\n"
            "यह मुआवजा न्यायालय द्वारा दी गई क्षतिपूर्ति से अलग है। "
            "दोषसिद्धि की प्रतीक्षा किए बिना पीड़ित को राहत मिलनी चाहिए।"
        ),
        "metadata": {"act_section": "Rule 12(4)", "last_amended": "2016"},
    },
    {
        "source": "SC/ST PoA Act 1989, Section 15A [Hindi]",
        "title": "SC/ST अत्याचार पीड़ितों के अधिकार - धारा 15A",
        "category": "legal_rights",
        "jurisdiction": "IN",
        "language": "hi",
        "content": (
            "SC/ST (अत्याचार निवारण) अधिनियम 1989 की धारा 15A के अंतर्गत पीड़ित के अधिकार:\n\n"
            "1. जांच और मुकदमे के हर चरण में अपने अधिकारों की जानकारी पाने का अधिकार।\n"
            "2. जिला विधिक सेवा प्राधिकरण (DLSA) द्वारा निःशुल्क अधिवक्ता का अधिकार।\n"
            "3. न्यायालय में उपस्थित होने के लिए यात्रा, भोजन और आवास का खर्च पाने का अधिकार।\n"
            "4. जांच की प्रगति के बारे में सूचित किए जाने का अधिकार।\n\n"
            "यदि पुलिस FIR दर्ज करने से इनकार करे:\n"
            "- पुलिस अधीक्षक (SP) को लिखित शिकायत दें\n"
            "- जिलाधिकारी (DM) को शिकायत दें\n"
            "- राज्य SC/ST आयोग से संपर्क करें"
        ),
        "metadata": {"act_section": "15A", "last_amended": "2015"},
    },
]


async def seed() -> None:
    from services.supabase_client import get_supabase
    from services.embedding_service import get_embedder

    supabase = await get_supabase()
    embedder = get_embedder()

    logger.info("Starting legal knowledge seed (%d documents)", len(LEGAL_CORPUS))

    inserted = 0
    skipped = 0
    failed = 0

    for doc in LEGAL_CORPUS:
        try:
            # Idempotency check: skip if same source+title already exists
            existing = await supabase.table("legal_documents") \
                .select("id") \
                .eq("source", doc["source"]) \
                .eq("title", doc["title"]) \
                .execute()

            if existing.data:
                logger.debug("Skipping (already exists): %s", doc["title"][:60])
                skipped += 1
                continue

            # Generate embedding
            vectors = await embedder.embed([doc["content"]])
            embedding = vectors[0]

            await supabase.table("legal_documents").insert({
                **doc,
                "embedding": embedding,
            }).execute()

            logger.info("Inserted: %s", doc["title"][:70])
            inserted += 1

        except Exception as exc:
            logger.error("Failed to insert '%s': %s", doc["title"][:60], exc)
            failed += 1

    logger.info(
        "Seed complete: %d inserted, %d skipped (duplicate), %d failed",
        inserted, skipped, failed,
    )


if __name__ == "__main__":
    asyncio.run(seed())
