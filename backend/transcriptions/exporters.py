import io
import json
from django.http import HttpResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors


def export_transcription(transcription, fmt):
    fmt = fmt.lower()
    if fmt == 'txt':
        return export_txt(transcription)
    elif fmt == 'pdf':
        return export_pdf(transcription)
    elif fmt == 'json':
        return export_json(transcription)
    elif fmt == 'srt':
        return export_srt(transcription)
    else:
        return HttpResponse("Invalid format. Use txt, pdf, json, or srt.", status=400)


def export_txt(t):
    content = f"""Title: {t.title}
Date: {t.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}
Duration: {t.duration_seconds}s
Language: {t.language}
Engine: {t.engine}
Word Count: {t.word_count}
{"="*50}

{t.text}
"""
    response = HttpResponse(content, content_type="text/plain; charset=utf-8")
    response['Content-Disposition'] = f'attachment; filename="transcript_{t.id}.txt"'
    return response


def export_json(t):
    data = {
        "id": str(t.id),
        "title": t.title,
        "text": t.text,
        "language": t.language,
        "detected_languages": t.detected_languages,
        "engine": t.engine,
        "duration_seconds": t.duration_seconds,
        "word_count": t.word_count,
        "created_at": t.created_at.isoformat(),
        "summary": t.summary,
        "key_points": t.key_points,
        "action_items": t.action_items,
        "translation": t.translation,
    }
    content = json.dumps(data, indent=2, ensure_ascii=False)
    response = HttpResponse(content, content_type="application/json; charset=utf-8")
    response['Content-Disposition'] = f'attachment; filename="transcript_{t.id}.json"'
    return response


def export_srt(t):
    # Segment text into chunks for SRT format
    words = t.text.split()
    chunk_size = 10
    chunks = [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]
    
    total_duration = max(t.duration_seconds, len(chunks) * 3)
    chunk_duration = total_duration / max(1, len(chunks))

    srt_lines = []
    for idx, chunk in enumerate(chunks, 1):
        start_sec = (idx - 1) * chunk_duration
        end_sec = idx * chunk_duration
        
        def format_time(seconds):
            hrs = int(seconds // 3600)
            mins = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds - int(seconds)) * 1000)
            return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

        srt_lines.append(f"{idx}")
        srt_lines.append(f"{format_time(start_sec)} --> {format_time(end_sec)}")
        srt_lines.append(f"{chunk}\n")

    content = "\n".join(srt_lines)
    response = HttpResponse(content, content_type="text/plain; charset=utf-8")
    response['Content-Disposition'] = f'attachment; filename="transcript_{t.id}.srt"'
    return response


def export_pdf(t):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#062A33'),
        spaceAfter=12
    )
    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=16,
        textColor=colors.HexColor('#222222'),
        spaceAfter=10
    )
    meta_style = ParagraphStyle(
        'Meta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#555555')
    )

    elements = []
    elements.append(Paragraph("VoiceText AI · Real-Time Audio Transcript", meta_style))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(t.title or "Untitled Transcript", title_style))
    elements.append(Spacer(1, 10))

    meta_data = [
        [Paragraph(f"<b>Date:</b> {t.created_at.strftime('%Y-%m-%d %H:%M UTC')}", meta_style),
         Paragraph(f"<b>Duration:</b> {t.duration_seconds} seconds", meta_style)],
        [Paragraph(f"<b>Engine:</b> {t.engine}", meta_style),
         Paragraph(f"<b>Language:</b> {t.language}", meta_style)],
        [Paragraph(f"<b>Word Count:</b> {t.word_count}", meta_style),
         Paragraph(f"<b>Session ID:</b> {t.device_session_id[:8]}...", meta_style)],
    ]
    meta_table = Table(meta_data, colWidths=[260, 260])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F4F9FA')),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1E7EC')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2F0F3')),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 16))

    if t.summary:
        elements.append(Paragraph("<b>AI Summary</b>", styles['Heading3']))
        elements.append(Paragraph(t.summary.replace("\n", "<br/>"), body_style))
        elements.append(Spacer(1, 10))

    elements.append(Paragraph("<b>Transcript</b>", styles['Heading3']))
    elements.append(Paragraph(t.text.replace("\n", "<br/>") or "<i>(No text recorded)</i>", body_style))

    doc.build(elements)
    buffer.seek(0)

    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response['Content-Disposition'] = f'attachment; filename="transcript_{t.id}.pdf"'
    return response
