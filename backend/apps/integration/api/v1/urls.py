from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.integration.api.v1.views import (
    DocumentExtractionViewSet,
    FicheRecipeTitleListView,
    DocumentIngestViewSet,
    IntegrationDocumentViewSet,
)


router = DefaultRouter()
router.register("integration/documents", IntegrationDocumentViewSet, basename="integration-document")

urlpatterns = [
    path(
        "integration/fiches/recipe-titles/",
        FicheRecipeTitleListView.as_view(),
        name="integration-fiches-recipe-titles",
    ),
    path(
        "integration/documents/<uuid:document_id>/extractions/",
        DocumentExtractionViewSet.as_view({"post": "create"}),
        name="integration-document-extraction-create",
    ),
    path(
        "integration/documents/<uuid:document_id>/ingest/",
        DocumentIngestViewSet.as_view({"post": "create"}),
        name="integration-document-ingest-create",
    ),
]

urlpatterns += router.urls
