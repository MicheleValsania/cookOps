from django.urls import path

from apps.core.api.v1.views import HealthView, SiteDetailView, SiteListView


urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("sites/", SiteListView.as_view(), name="site-list"),
    path("sites/<uuid:site_id>/", SiteDetailView.as_view(), name="site-detail"),
]
