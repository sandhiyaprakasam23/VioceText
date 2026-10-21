import uuid
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .models import Transcription, UserSettings


class TranscriptionAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.session_a = "device-session-aaa-111"
        self.session_b = "device-session-bbb-222"

        # Headers for device session A
        self.client.credentials(HTTP_X_SESSION_ID=self.session_a)

        # Create sample transcriptions for session A
        self.t1 = Transcription.objects.create(
            device_session_id=self.session_a,
            title="Tamil Meeting Discussion",
            text="வணக்கம் இது ஒரு முக்கிய கலந்துரையாடல். We need to complete this today.",
            language="ta-IN",
            engine="gemini-live",
            duration_seconds=75,
            is_favorite=True,
        )
        self.t2 = Transcription.objects.create(
            device_session_id=self.session_a,
            title="English Standup Notes",
            text="Quick update on the backend API and frontend styling.",
            language="en-IN",
            engine="browser-webspeech",
            duration_seconds=30,
            is_favorite=False,
        )

        # Create sample transcription for session B
        self.t_b = Transcription.objects.create(
            device_session_id=self.session_b,
            title="Session B Private Notes",
            text="This should never be visible to session A.",
            language="en-US",
            engine="gemini-live",
            duration_seconds=15,
        )

    def test_list_transcriptions_session_isolation(self):
        """Verify that user only sees their own device session transcriptions."""
        response = self.client.get("/api/transcriptions/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Results might be paginated
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 2)
        titles = [r["title"] for r in results]
        self.assertIn("Tamil Meeting Discussion", titles)
        self.assertIn("English Standup Notes", titles)
        self.assertNotIn("Session B Private Notes", titles)

    def test_create_transcription(self):
        """Test creating a new transcription record."""
        payload = {
            "title": "New Idea Recording",
            "text": "Testing speech-to-text live save feature.",
            "language": "en-IN",
            "engine": "gemini-live",
            "duration_seconds": 45,
        }
        response = self.client.post("/api/transcriptions/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "New Idea Recording")
        self.assertEqual(response.data["word_count"], 5)
        self.assertEqual(response.data["device_session_id"], self.session_a)

    def test_search_and_filter(self):
        """Test search query and language filter."""
        # Search by query
        res_search = self.client.get("/api/transcriptions/?search=Tamil")
        results = res_search.data.get("results", res_search.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Tamil Meeting Discussion")

        # Filter by language
        res_lang = self.client.get("/api/transcriptions/?language=en-IN")
        results_lang = res_lang.data.get("results", res_lang.data)
        self.assertEqual(len(results_lang), 1)
        self.assertEqual(results_lang[0]["language"], "en-IN")

        # Filter by favorite
        res_fav = self.client.get("/api/transcriptions/?is_favorite=true")
        results_fav = res_fav.data.get("results", res_fav.data)
        self.assertEqual(len(results_fav), 1)
        self.assertEqual(results_fav[0]["is_favorite"], True)

    def test_toggle_favorite(self):
        """Test toggling favorite status."""
        url = f"/api/transcriptions/{self.t2.id}/toggle_favorite/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_favorite"])

        # Toggle back
        response = self.client.post(url)
        self.assertFalse(response.data["is_favorite"])

    def test_bulk_delete(self):
        """Test deleting multiple items at once."""
        url = "/api/transcriptions/bulk_delete/"
        response = self.client.post(url, {"ids": [str(self.t1.id), str(self.t2.id)]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["deleted"], 2)

    def test_export_txt_json_srt(self):
        """Test export endpoints for TXT, JSON, and SRT formats."""
        res_txt = self.client.get(f"/api/transcriptions/{self.t1.id}/export/?format=txt")
        self.assertEqual(res_txt.status_code, status.HTTP_200_OK)
        self.assertIn("Tamil Meeting Discussion", res_txt.content.decode("utf-8"))

        res_json = self.client.get(f"/api/transcriptions/{self.t1.id}/export/?format=json")
        self.assertEqual(res_json.status_code, status.HTTP_200_OK)
        self.assertEqual(res_json["Content-Type"], "application/json; charset=utf-8")

        res_srt = self.client.get(f"/api/transcriptions/{self.t1.id}/export/?format=srt")
        self.assertEqual(res_srt.status_code, status.HTTP_200_OK)
        self.assertIn("-->", res_srt.content.decode("utf-8"))

    def test_public_share(self):
        """Test sharing a transcription publicly via share token."""
        # Enable sharing
        share_url = f"/api/transcriptions/{self.t1.id}/share/"
        res_share = self.client.post(share_url, {"is_public": True}, format="json")
        self.assertEqual(res_share.status_code, status.HTTP_200_OK)
        share_token = res_share.data["share_token"]

        # Access public endpoint without session header
        anon_client = APIClient()
        res_public = anon_client.get(f"/api/public/share/{share_token}/")
        self.assertEqual(res_public.status_code, status.HTTP_200_OK)
        self.assertEqual(res_public.data["title"], "Tamil Meeting Discussion")

    def test_stats_endpoint(self):
        """Test stats calculation for current session."""
        response = self.client.get("/api/stats/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_sessions"], 2)
        self.assertGreater(response.data["total_words"], 0)
        self.assertGreater(response.data["total_minutes"], 0)
