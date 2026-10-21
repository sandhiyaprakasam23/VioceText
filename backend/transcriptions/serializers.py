from rest_framework import serializers
from .models import Transcription, UserSettings


class TranscriptionSerializer(serializers.ModelSerializer):
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = Transcription
        fields = [
            'id',
            'device_session_id',
            'title',
            'text',
            'language',
            'detected_languages',
            'engine',
            'duration_seconds',
            'word_count',
            'audio_file',
            'audio_url',
            'is_favorite',
            'is_archived',
            'share_token',
            'is_public',
            'summary',
            'key_points',
            'action_items',
            'translation',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'device_session_id', 'share_token', 'created_at', 'updated_at', 'word_count']

    def get_audio_url(self, obj):
        if obj.audio_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.audio_file.url)
            return obj.audio_file.url
        return None


class PublicTranscriptionSerializer(serializers.ModelSerializer):
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = Transcription
        fields = [
            'id',
            'title',
            'text',
            'language',
            'detected_languages',
            'engine',
            'duration_seconds',
            'word_count',
            'audio_url',
            'summary',
            'key_points',
            'action_items',
            'translation',
            'created_at',
        ]

    def get_audio_url(self, obj):
        if obj.audio_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.audio_file.url)
            return obj.audio_file.url
        return None


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = [
            'device_session_id',
            'default_language',
            'default_engine',
            'auto_save',
            'save_audio',
            'auto_copy_on_stop',
            'show_timestamps',
            'theme',
            'font_size',
            'updated_at',
        ]
        read_only_fields = ['updated_at']
