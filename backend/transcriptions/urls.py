from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TranscriptionViewSet, PublicTranscriptionView, StatsView, UserSettingsView

router = DefaultRouter()
router.register(r'transcriptions', TranscriptionViewSet, basename='transcription')

urlpatterns = [
    path('', include(router.urls)),
    path('stats/', StatsView.as_view(), name='stats'),
    path('settings/', UserSettingsView.as_view(), name='settings'),
    path('public/share/<str:token>/', PublicTranscriptionView.as_view(), name='public-share'),
]
