from django.apps import AppConfig


class TranscriptionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'transcriptions'

    def ready(self):
        # Auto-run migrate on startup if running in production without manual migration step
        import sys
        if 'migrate' not in sys.argv and 'makemigrations' not in sys.argv:
            try:
                from django.core.management import call_command
                from django.db import connection
                tables = connection.introspection.table_names()
                if 'transcriptions_transcription' not in tables:
                    call_command('migrate', interactive=False)
            except Exception:
                pass
