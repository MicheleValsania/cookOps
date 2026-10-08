from django.urls import path

from apps.core.api.v1.views import (
    AuthStatusView,
    AuthOptionsView,
    HealthView,
    LegacyLoginView,
    RegisterView,
    ServiceIngredientsView,
    ServiceMenuEntrySyncView,
    SiteDetailView,
    SiteListView,
)


urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("auth/login", LegacyLoginView.as_view(), name="auth-login"),
    path("auth/options", AuthOptionsView.as_view(), name="auth-options"),
    path("auth/register", RegisterView.as_view(), name="auth-register"),
    path("auth/status", AuthStatusView.as_view(), name="auth-status"),
    path("sites/", SiteListView.as_view(), name="site-list"),
    path("sites/<uuid:site_id>/", SiteDetailView.as_view(), name="site-detail"),
    path("servizio/menu-entries/sync", ServiceMenuEntrySyncView.as_view(), name="service-menu-entry-sync"),
    path("servizio/ingredients", ServiceIngredientsView.as_view(), name="service-ingredients"),
]
