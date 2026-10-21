import uuid
from django.conf import settings
from django.db.models import Q, Count, Sum
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Transcription, UserSettings
from .serializers import TranscriptionSerializer, PublicTranscriptionSerializer, UserSettingsSerializer
from .exporters import export_transcription
from .ai_assistant import generate_ai_analysis


def get_device_session_id(request):
    """
    Extracts the anonymous per-device session UUID from headers, query param, or cookies.
    Never mix users' data.
    """
    session_id = (
        request.headers.get("X-Session-ID") or
        request.query_params.get("session_id") or
        request.COOKIES.get("device_session_id")
    )
    if not session_id:
        session_id = "default-anonymous-session"
    return str(session_id).strip()


class TranscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = TranscriptionSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        session_id = get_device_session_id(self.request)
        queryset = Transcription.objects.filter(device_session_id=session_id, is_archived=False)
        params = getattr(self.request, "query_params", getattr(self.request, "GET", {}))

        # Search filter
        search = params.get("search")
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(text__icontains=search))

        # Language filter
        language = params.get("language")
        if language and language != "all":
            queryset = queryset.filter(language=language)

        # Favorite filter
        is_favorite = params.get("is_favorite")
        if is_favorite is not None and is_favorite != "":
            fav_bool = str(is_favorite).lower() in ["true", "1"]
            queryset = queryset.filter(is_favorite=fav_bool)

        # Date range filter
        date_from = params.get("date_from")
        date_to = params.get("date_to")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        # Ordering
        ordering = params.get("ordering", "-created_at")
        valid_orderings = ["created_at", "-created_at", "duration_seconds", "-duration_seconds", "word_count", "-word_count", "title", "-title"]
        if ordering in valid_orderings:
            queryset = queryset.order_by(ordering)

        return queryset

    def perform_create(self, serializer):
        session_id = get_device_session_id(self.request)
        serializer.save(device_session_id=session_id)

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        ids = request.data.get("ids", [])
        if not ids or not isinstance(ids, list):
            return Response({"error": "List of 'ids' required"}, status=status.HTTP_400_BAD_REQUEST)

        session_id = get_device_session_id(request)
        deleted_count, _ = Transcription.objects.filter(device_session_id=session_id, id__in=ids).delete()
        return Response({"deleted": deleted_count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def toggle_favorite(self, request, pk=None):
        instance = self.get_object()
        instance.is_favorite = not instance.is_favorite
        instance.save(update_fields=["is_favorite"])
        return Response({"is_favorite": instance.is_favorite})

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def audio(self, request, pk=None):
        instance = self.get_object()
        audio_file = request.FILES.get("audio_file")
        if not audio_file:
            return Response({"error": "No 'audio_file' uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        instance.audio_file = audio_file
        
        # If transcript text is empty, auto-transcribe from audio file using Gemini!
        if not instance.text:
            try:
                audio_file.seek(0)
                from .ai_assistant import transcribe_audio_bytes
                mime = getattr(audio_file, 'content_type', 'audio/webm')
                api_key = request.headers.get("X-Gemini-Key") or getattr(settings, "GEMINI_API_KEY", "")
                text = transcribe_audio_bytes(audio_file.read(), mime, instance.language, api_key=api_key)
                if text:
                    instance.text = text
                    instance.word_count = len(text.strip().split())
            except Exception as e:
                pass

        instance.save()
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def transcribe_audio(self, request):
        audio_file = request.FILES.get("audio_file")
        if not audio_file:
            return Response({"error": "No 'audio_file' uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        language = request.data.get("language", "ta-IN")
        api_key = request.headers.get("X-Gemini-Key") or request.data.get("api_key") or getattr(settings, "GEMINI_API_KEY", "")
        audio_bytes = audio_file.read()
        mime_type = getattr(audio_file, "content_type", "audio/webm")

        from .ai_assistant import transcribe_audio_bytes
        text = transcribe_audio_bytes(audio_bytes, mime_type, language, api_key=api_key)

        return Response({
            "text": text,
            "word_count": len(text.strip().split()) if text else 0,
            "language": language,
            "gemini_active": bool(api_key),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def share(self, request, pk=None):
        instance = self.get_object()
        is_public = request.data.get("is_public")
        regenerate = request.data.get("regenerate", False)

        if is_public is not None:
            instance.is_public = bool(is_public)
        else:
            instance.is_public = not instance.is_public

        if regenerate:
            instance.share_token = str(uuid.uuid4())

        instance.save(update_fields=["is_public", "share_token"])
        return Response({
            "is_public": instance.is_public,
            "share_token": instance.share_token,
            "share_path": f"/s/{instance.share_token}",
        })

    def perform_content_negotiation(self, request, force=False):
        if getattr(self, "action", None) == "export":
            from rest_framework.renderers import BaseRenderer
            class PassthroughRenderer(BaseRenderer):
                media_type = "*/*"
                format = "export"
                def render(self, data, accepted_media_type=None, renderer_context=None):
                    return data
            return (PassthroughRenderer(), "*/*")
        return super().perform_content_negotiation(request, force)

    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        instance = self.get_object()
        fmt = request.query_params.get("format") or request.query_params.get("export_format", "txt")
        return export_transcription(instance, fmt)

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        instance = self.get_object()
        target_lang = request.data.get("target_language", "en")
        api_key = request.headers.get("X-Gemini-Key") or request.data.get("api_key") or getattr(settings, "GEMINI_API_KEY", "")
        analysis = generate_ai_analysis(instance.text, target_lang, api_key=api_key)

        if not instance.title or instance.title == "Untitled Recording":
            instance.title = analysis.get("title", instance.title)
        instance.summary = analysis.get("summary")
        instance.key_points = analysis.get("key_points", [])
        instance.action_items = analysis.get("action_items", [])
        instance.translation = analysis.get("translation", {})
        instance.save()

        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PublicTranscriptionView(APIView):
    """
    Public read-only view for shared transcriptions: /s/<token>
    """
    def get(self, request, token):
        transcription = get_object_or_404(Transcription, share_token=token, is_public=True)
        serializer = PublicTranscriptionSerializer(transcription, context={"request": request})
        return Response(serializer.data)


class StatsView(APIView):
    """
    Session statistics strip:
    - total sessions
    - total minutes
    - total words
    - top language
    """
    def get(self, request):
        session_id = get_device_session_id(request)
        qs = Transcription.objects.filter(device_session_id=session_id, is_archived=False)

        total_sessions = qs.count()
        total_seconds = qs.aggregate(Sum("duration_seconds"))["duration_seconds__sum"] or 0
        total_words = qs.aggregate(Sum("word_count"))["word_count__sum"] or 0
        
        top_lang_query = qs.values("language").annotate(count=Count("language")).order_by("-count").first()
        top_language = top_lang_query["language"] if top_lang_query else "None"

        return Response({
            "total_sessions": total_sessions,
            "total_minutes": round(total_seconds / 60, 1),
            "total_words": total_words,
            "top_language": top_language,
        })


class UserSettingsView(APIView):
    def get(self, request):
        session_id = get_device_session_id(request)
        settings_obj, _ = UserSettings.objects.get_or_create(device_session_id=session_id)
        serializer = UserSettingsSerializer(settings_obj)
        return Response(serializer.data)

    def post(self, request):
        session_id = get_device_session_id(request)
        settings_obj, _ = UserSettings.objects.get_or_create(device_session_id=session_id)
        serializer = UserSettingsSerializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
