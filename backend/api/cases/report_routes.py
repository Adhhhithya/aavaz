import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from services.supabase_client import get_supabase
from api.auth.dependencies import CurrentStaffUser, require_roles
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

router = APIRouter()

_ALLOWED_ROLES = ("counsellor", "district_admin", "state_admin", "national_admin", "super_admin")


@router.get("/{case_id}/report")
async def generate_case_report(
    case_id: str,
    current_user: CurrentStaffUser = Depends(require_roles(*_ALLOWED_ROLES)),
):
    try:
        supabase = await get_supabase()
        case_resp = await supabase.table("cases").select("*").eq("id", case_id).single().execute()

        if not case_resp.data:
            raise HTTPException(status_code=404, detail="Case not found")

        case_data = case_resp.data

        if current_user.role == "counsellor" and case_data.get("assigned_counsellor_id") != current_user.id:
            raise HTTPException(status_code=403, detail="This case is not assigned to you")

        ecourts = case_data.get("ecourts_data") or {}
        
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
        
        styles = getSampleStyleSheet()
        title_style = styles['Heading1']
        h2_style = styles['Heading2']
        normal_style = styles['Normal']
        
        elements = []
        
        # Title
        elements.append(Paragraph(f"Official Case Report: {case_data.get('cnr', 'N/A')}", title_style))
        elements.append(Spacer(1, 12))
        
        # Case Overview
        elements.append(Paragraph("Case Overview", h2_style))
        overview_data = [
            ["Case Type", ecourts.get("caseType", case_data.get("case_type", "N/A"))],
            ["Status", ecourts.get("caseStatus", case_data.get("case_stage", "N/A"))],
            ["Court", ecourts.get("courtCode", "N/A")],
            ["Distress Score", str(case_data.get("current_distress_score", "N/A"))]
        ]
        
        t = Table(overview_data, colWidths=[150, 300])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(t)
        elements.append(Spacer(1, 24))
        
        # Parties
        elements.append(Paragraph("Parties Involved", h2_style))
        petitioners = ", ".join(ecourts.get("petitioners", [])) or "None Listed"
        respondents = ", ".join(ecourts.get("respondents", [])) or "None Listed"
        p_advs = ", ".join(ecourts.get("petitionerAdvocates", [])) or "None Listed"
        
        parties_data = [
            ["Petitioners", petitioners],
            ["Respondents", respondents],
            ["Advocates", p_advs]
        ]
        
        t2 = Table(parties_data, colWidths=[150, 300])
        t2.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ]))
        elements.append(t2)
        elements.append(Spacer(1, 24))
        
        # Timeline
        elements.append(Paragraph("Case Timeline", h2_style))
        timeline_data = [["Event", "Date"]]
        
        if ecourts.get("filingDate"):
            timeline_data.append(["Case Filed", ecourts["filingDate"]])
        if ecourts.get("registrationDate"):
            timeline_data.append(["Case Registered", ecourts["registrationDate"]])
        if ecourts.get("decisionDate"):
            timeline_data.append(["Decision Date", ecourts["decisionDate"]])
        elif ecourts.get("nextHearingDate"):
            timeline_data.append(["Next Hearing", ecourts["nextHearingDate"]])
            
        if len(timeline_data) == 1:
            timeline_data.append(["No dates available", ""])
            
        t3 = Table(timeline_data, colWidths=[200, 250])
        t3.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(t3)
        elements.append(Spacer(1, 24))
        
        # Detailed Case Update
        detailed_update = ecourts.get("detailed_case_update")
        if detailed_update:
            elements.append(Paragraph("Detailed Case Update", h2_style))
            # Split by newlines to handle multi-paragraph
            for p_text in detailed_update.split('\n'):
                if p_text.strip():
                    elements.append(Paragraph(p_text.strip(), normal_style))
                    elements.append(Spacer(1, 6))
            elements.append(Spacer(1, 18))
            
        # Order History
        orders = ecourts.get("orders") or ecourts.get("historyOfCaseHearings") or []
        if orders:
            elements.append(Paragraph("Hearing & Order History", h2_style))
            order_data = [["Date", "Description/Judge"]]
            
            for o in orders:
                # Handle both 'orders' and 'historyOfCaseHearings' schemas
                date = o.get("orderDate") or o.get("hearingDate") or "N/A"
                desc = o.get("description") or o.get("judge") or o.get("purposeOfHearing") or "N/A"
                
                # Truncate overly long descriptions for table cell formatting
                if len(desc) > 80:
                    desc = desc[:77] + "..."
                order_data.append([date, desc])
                
            t4 = Table(order_data, colWidths=[150, 300], repeatRows=1)
            t4.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2e3b4e')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white])
            ]))
            elements.append(t4)
        
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"case_report_{case_data.get('cnr', case_id[:8])}.pdf"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to generate report")
