from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.core.api.v1.urls")),
    path("api/v1/", include("apps.catalog.api.v1.urls")),
    path("api/v1/", include("apps.purchasing.api.v1.urls")),
    path("api/v1/", include("apps.inventory.api.v1.urls")),
    path("api/v1/", include("apps.pos.api.v1.urls")),
    path("api/v1/", include("apps.integration.api.v1.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
