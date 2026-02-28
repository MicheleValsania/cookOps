from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.integration.api.v1.views import (
    FicheCatalogImportView,
    DocumentExtractionViewSet,
    FicheSnapshotEnvelopeImportView,
    FicheSnapshotImportView,
    FicheRecipeTitleListView,
    DocumentIngestViewSet,
    IntegrationDocumentViewSet,
)


router = DefaultRouter()
router.register("integration/documents", IntegrationDocumentViewSet, basename="integration-document")

urlpatterns = [
    path(
        "integration/fiches/catalog/import/",
        FicheCatalogImportView.as_view(),
        name="integration-fiches-catalog-import",
    ),
    path(
        "integration/fiches/snapshots/import/",
        FicheSnapshotImportView.as_view(),
        name="integration-fiches-snapshot-import",
    ),
    path(
        "integration/fiches/snapshots/import-envelope/",
        FicheSnapshotEnvelopeImportView.as_view(),
        name="integration-fiches-snapshot-envelope-import",
    ),
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
