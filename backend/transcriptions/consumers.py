import json
import asyncio
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings

logger = logging.getLogger(__name__)


class LiveTranscriptionConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.gemini_session = None
        self.gemini_receive_task = None
        self.client_language = "en-IN"
        self.is_gemini_active = False

    async def connect(self):
        await self.accept()
        query_string = self.scope.get("query_string", b"").decode("utf-8")
        params = dict(qc.split("=") for qc in query_string.split("&") if "=" in qc)
        self.client_language = params.get("language", "en-IN")
        self.client_gemini_key = params.get("gemini_key", "")

        await self.send(text_data=json.dumps({
            "type": "connection_established",
            "message": "Connected to VoiceText Live WebSocket server.",
            "language": self.client_language,
        }))

    async def disconnect(self, close_code):
        await self._stop_gemini_session()

    async def receive(self, text_data=None, bytes_data=None):
        if text_data:
            try:
                data = json.loads(text_data)
                action = data.get("action")

                if action == "start":
                    self.client_language = data.get("language", self.client_language)
                    if data.get("gemini_key"):
                        self.client_gemini_key = data.get("gemini_key")
                    engine = data.get("engine", "gemini-live")
                    if engine == "gemini-live":
                        await self._start_gemini_session()
                    else:
                        await self.send(text_data=json.dumps({
                            "type": "status",
                            "status": "ready",
                            "message": "Using browser Web Speech engine."
                        }))

                elif action == "audio_chunk":
                    # Base64 PCM chunk
                    import base64
                    pcm_b64 = data.get("data")
                    if pcm_b64 and self.is_gemini_active and self.gemini_session:
                        pcm_bytes = base64.b64decode(pcm_b64)
                        await self._forward_audio_to_gemini(pcm_bytes)

                elif action == "stop":
                    await self._stop_gemini_session()
                    await self.send(text_data=json.dumps({
                        "type": "status",
                        "status": "stopped",
                        "message": "Session stopped."
                    }))

            except Exception as e:
                logger.exception("Error processing text data: %s", e)
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "message": f"Error: {str(e)}"
                }))

        elif bytes_data:
            # Direct binary PCM chunk (16 kHz, 16-bit mono)
            if self.is_gemini_active and self.gemini_session:
                await self._forward_audio_to_gemini(bytes_data)

    async def _start_gemini_session(self):
        gemini_key = getattr(self, "client_gemini_key", "") or getattr(settings, "GEMINI_API_KEY", "")
        if not gemini_key:
            await self.send(text_data=json.dumps({
                "type": "fallback_notice",
                "message": "Gemini API key is not configured. Falling back to Browser Web Speech API.",
                "fallback": True
            }))
            return

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=gemini_key)
            model = getattr(settings, "GEMINI_LIVE_MODEL", "gemini-2.0-flash-exp")

            system_instruction = (
                "You are an expert real-time speech transcriber. "
                "Listen to the live audio stream and transcribe every word exactly as spoken. "
                "Support multilingual and code-mixed speech (e.g. Tamil + English, Hindi + English). "
                "Keep each language in its native script: write Tamil words in Tamil script, Hindi in Devanagari script, "
                "and English in Latin script. Do not translate. Output ONLY the verbatim spoken transcript."
            )

            config = types.LiveConnectConfig(
                response_modalities=[types.LiveServerContentModality.TEXT],
                system_instruction=types.Content(
                    parts=[types.Part.from_text(text=system_instruction)]
                ),
            )

            self.gemini_context = client.aio.live.connect(model=model, config=config)
            self.gemini_session = await self.gemini_context.__aenter__()
            self.is_gemini_active = True

            # Start background receive task
            self.gemini_receive_task = asyncio.create_task(self._listen_gemini_responses())

            await self.send(text_data=json.dumps({
                "type": "status",
                "status": "active",
                "engine": "gemini-live",
                "message": "Gemini Live API connected and listening."
            }))

        except Exception as e:
            logger.warning(f"Failed to connect to Gemini Live API: {e}. Advising fallback.")
            self.is_gemini_active = False
            await self.send(text_data=json.dumps({
                "type": "fallback_notice",
                "message": f"Gemini Live connection notice: {str(e)}. Seamlessly switching to Web Speech API fallback.",
                "fallback": True
            }))

    async def _forward_audio_to_gemini(self, pcm_bytes):
        if not self.gemini_session or not self.is_gemini_active:
            return
        try:
            from google.genai import types
            await self.gemini_session.send_realtime_input(
                audio=types.Blob(data=pcm_bytes, mime_type="audio/pcm;rate=16000")
            )
        except Exception as e:
            logger.error(f"Error sending audio to Gemini Live: {e}")

    async def _listen_gemini_responses(self):
        try:
            while self.is_gemini_active and self.gemini_session:
                async for response in self.gemini_session.receive():
                    server_content = getattr(response, "server_content", None)
                    if server_content:
                        model_turn = getattr(server_content, "model_turn", None)
                        if model_turn and hasattr(model_turn, "parts"):
                            for part in model_turn.parts:
                                text = getattr(part, "text", "")
                                if text:
                                    await self.send(text_data=json.dumps({
                                        "type": "transcript",
                                        "text": text,
                                        "is_final": False,
                                        "engine": "gemini-live"
                                    }))

                        turn_complete = getattr(server_content, "turn_complete", False)
                        if turn_complete:
                            await self.send(text_data=json.dumps({
                                "type": "turn_complete"
                            }))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in Gemini receive loop: {e}")

    async def _stop_gemini_session(self):
        self.is_gemini_active = False
        if self.gemini_receive_task:
            self.gemini_receive_task.cancel()
            self.gemini_receive_task = None
        if self.gemini_session:
            try:
                await self.gemini_context.__aexit__(None, None, None)
            except Exception:
                pass
            self.gemini_session = None
