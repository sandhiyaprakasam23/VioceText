import uuid
from django.db import models


class Transcription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_session_id = models.CharField(max_length=128, db_index=True, help_text="Anonymous per-device session isolation ID")
    title = models.CharField(max_length=255, blank=True)
    text = models.TextField(blank=True)
    language = models.CharField(max_length=50, default="en-IN")
    detected_languages = models.JSONField(default=list, blank=True)
    engine = models.CharField(
        max_length=50,
        choices=[("gemini-live", "Gemini Live API"), ("browser-webspeech", "Browser Web Speech API")],
        default="gemini-live"
    )
    duration_seconds = models.IntegerField(default=0)
    word_count = models.IntegerField(default=0)
    audio_file = models.FileField(upload_to="recordings/%Y/%m/", null=True, blank=True)
    is_favorite = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    share_token = models.CharField(max_length=64, unique=True, default=uuid.uuid4, db_index=True)
    is_public = models.BooleanField(default=False)
    
    # AI Assistant generated metadata (optional fields populated post-recording)
    summary = models.TextField(blank=True, null=True)
    key_points = models.JSONField(default=list, blank=True)
    action_items = models.JSONField(default=list, blank=True)
    translation = models.JSONField(default=dict, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        # Auto-calculate word count if not set or text changed
        if self.text:
            self.word_count = len(self.text.strip().split())
            if not self.title:
                # Auto-generate title from first 6 words
                words = self.text.strip().split()
                self.title = " ".join(words[:6]) + ("..." if len(words) > 6 else "")
        elif not self.title:
            self.title = "Untitled Recording"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"


class UserSettings(models.Model):
    device_session_id = models.CharField(max_length=128, unique=True, db_index=True)
    default_language = models.CharField(max_length=50, default="en-IN")
    default_engine = models.CharField(max_length=50, default="browser-webspeech")
    auto_save = models.BooleanField(default=True)
    save_audio = models.BooleanField(default=True)
    auto_copy_on_stop = models.BooleanField(default=False)
    show_timestamps = models.BooleanField(default=True)
    theme = models.CharField(max_length=20, default="dark")
    font_size = models.CharField(max_length=20, default="medium")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings for {self.device_session_id}"
