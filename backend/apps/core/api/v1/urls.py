from django.urls import path

from apps.core.api.v1.views import HealthView


urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
]
