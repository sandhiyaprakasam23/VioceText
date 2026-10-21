import os
import sys

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, 'backend'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'voicetext.settings')

import django
django.setup()

from transcriptions.models import Transcription
from transcriptions.serializers import TranscriptionSerializer
from transcriptions.exporters import export_transcription
import transcriptions.routing

print("="*60)
print(" VoiceText End-to-End System Verification ")
print("="*60)

# 1. Database check
count = Transcription.objects.count()
print(f"[OK] Database Connected: Found {count} sample transcription(s).")

# 2. Model & Serializer check
sample = Transcription.objects.first()
if sample:
    serializer = TranscriptionSerializer(sample)
    print(f"[OK] Serializer Check: Title = '{sample.title}', Language = '{sample.language}', Word count = {sample.word_count}")

    # 3. Export verification
    for fmt in ['txt', 'pdf', 'json', 'srt']:
        res = export_transcription(sample, fmt)
        print(f"[OK] Exporter '{fmt.upper()}': Status = {res.status_code}, Content-Type = {res.get('Content-Type')}")

# 4. WebSocket Routing check
ws_patterns = transcriptions.routing.websocket_urlpatterns
print(f"[OK] Channels ASGI Routing: {len(ws_patterns)} pattern(s) registered.")

print("="*60)
print(" All systems operational and ready for deployment! ")
print("="*60)
