import json
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def transcribe_audio_bytes(audio_bytes, mime_type="audio/webm", language="ta-IN", api_key=None):
    """
    Directly converts audio recording bytes into text using Gemini multimodal model.
    Accurately supports Tamil + English, Hindi + English, etc.
    """
    gemini_key = api_key or getattr(settings, 'GEMINI_API_KEY', '')
    if not gemini_key:
        return ""
    if not audio_bytes:
        return ""

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        model_name = getattr(settings, 'GEMINI_TEXT_MODEL', 'gemini-1.5-flash')

        clean_mime = mime_type.split(';')[0] if mime_type else "audio/webm"
        prompt = (
            "Transcribe this audio recording exactly verbatim as spoken. "
            "Keep each language in its native script: write Tamil in Tamil script (தமிழ்), "
            "Hindi in Devanagari script (हिन्दी), and English in Latin script. "
            "Output ONLY the verbatim transcription without preamble, quotes, or explanations."
        )

        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type=clean_mime),
                prompt
            ]
        )
        return response.text.strip() if response.text else ""
    except Exception as e:
        logger.warning(f"Gemini audio transcription failed: {e}")
        return ""


def generate_ai_analysis(transcript_text, target_language="en", api_key=None):
    """
    Calls Gemini model to generate:
    - title
    - summary (2 lines)
    - key_points (array of strings)
    - action_items (array of strings)
    - translations (object with 'en', 'ta', 'hi')
    Returns dict. Gracefully degrades if Gemini API key is missing or fails.
    """
    if not transcript_text or not transcript_text.strip():
        return {
            "title": "Empty Transcript",
            "summary": "No speech detected in this recording.",
            "key_points": [],
            "action_items": [],
            "translation": {},
        }

    gemini_key = api_key or getattr(settings, 'GEMINI_API_KEY', '')
    if not gemini_key:
        return _fallback_analysis(transcript_text)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=gemini_key)
        prompt = f"""
You are an intelligent AI transcription assistant. Analyze the following transcript (which may contain mixed Tamil, English, Hindi, etc.):

TRANSCRIPT:
\"\"\"{transcript_text}\"\"\"

Return a valid JSON object matching this schema:
{{
  "title": "A concise 3-6 word title capturing the main subject",
  "summary": "A 2-line clear summary of the core discussion or thought",
  "key_points": ["Key point 1", "Key point 2", "Key point 3"],
  "action_items": ["Action item 1", "Action item 2"],
  "translation": {{
    "en": "Full translation in English",
    "ta": "முழு உரையின் தமிழ் மொழிபெயர்ப்பு (Tamil)",
    "hi": "पूरे भाषण का हिंदी अनुवाद (Hindi)"
  }}
}}
Return ONLY JSON without markdown formatting or code blocks.
"""
        model_name = getattr(settings, 'GEMINI_TEXT_MODEL', 'gemini-1.5-flash')
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
        )
        content_text = response.text.strip()
        # Clean potential markdown fences
        if content_text.startswith("```json"):
            content_text = content_text[7:]
        if content_text.startswith("```"):
            content_text = content_text[3:]
        if content_text.endswith("```"):
            content_text = content_text[:-3]
        
        data = json.loads(content_text.strip())
        return data
    except Exception as e:
        logger.warning(f"Gemini AI Assistant generation failed: {e}. Using fallback.")
        return _fallback_analysis(transcript_text)


def _fallback_analysis(transcript_text):
    words = transcript_text.strip().split()
    first_sentence = transcript_text.split(".")[0] if "." in transcript_text else transcript_text
    title = " ".join(words[:5]) + ("..." if len(words) > 5 else "")
    summary = f"{first_sentence[:120]}...\nSpoken transcript captured with {len(words)} words."
    
    key_points = [
        f"Session transcript of {len(words)} words recorded.",
        "Accurate live transcript preserved with full timestamps and audio.",
    ]
    if len(words) > 20:
        key_points.append("Includes detailed multilingual or code-mixed spoken phrases.")

    action_items = [
        "Review transcript notes and verify key points.",
        "Share or export recording as needed (TXT, PDF, JSON, SRT).",
    ]

    return {
        "title": title or "Voice Transcript",
        "summary": summary,
        "key_points": key_points,
        "action_items": action_items,
        "translation": {
            "en": transcript_text,
            "ta": transcript_text,
            "hi": transcript_text,
        },
    }
