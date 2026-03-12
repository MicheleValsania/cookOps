from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.integration.api.v1.haccp_views import (
    HaccpColdPointSyncView,
    HaccpColdPointListView,
    HaccpLifecycleEventListView,
    HaccpOcrQueueView,
    HaccpOcrValidateView,
    HaccpSectorListView,
    HaccpSectorSyncView,
    HaccpTracciaReconciliationOverviewView,
    HaccpScheduleDetailView,
    HaccpScheduleListCreateView,
)
from apps.integration.api.v1.views import (
    DocumentClaudeExtractView,
    DocumentExtractionViewSet,
    DocumentIngestViewSet,
    FicheCatalogImportView,
    FicheSnapshotEnvelopeImportView,
    FicheSnapshotImportView,
    FicheRecipeTitleListView,
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
    path(
        "integration/documents/<uuid:document_id>/extract-claude/",
        DocumentClaudeExtractView.as_view(),
        name="integration-document-claude-extract",
    ),
    path(
        "haccp/traccia/ocr-queue/",
        HaccpOcrQueueView.as_view(),
        name="haccp-traccia-ocr-queue",
    ),
    path(
        "haccp/traccia/ocr-queue/<uuid:document_id>/validate/",
        HaccpOcrValidateView.as_view(),
        name="haccp-traccia-ocr-validate",
    ),
    path(
        "haccp/traccia/lifecycle/",
        HaccpLifecycleEventListView.as_view(),
        name="haccp-traccia-lifecycle-list",
    ),
    path(
        "haccp/traccia/sectors/",
        HaccpSectorListView.as_view(),
        name="haccp-traccia-sector-list",
    ),
    path(
        "haccp/traccia/sectors/sync/",
        HaccpSectorSyncView.as_view(),
        name="haccp-traccia-sector-sync",
    ),
    path(
        "haccp/traccia/cold-points/",
        HaccpColdPointListView.as_view(),
        name="haccp-traccia-cold-point-list",
    ),
    path(
        "haccp/traccia/cold-points/sync/",
        HaccpColdPointSyncView.as_view(),
        name="haccp-traccia-cold-point-sync",
    ),
    path(
        "haccp/traccia/reconciliation-overview/",
        HaccpTracciaReconciliationOverviewView.as_view(),
        name="haccp-traccia-reconciliation-overview",
    ),
    path(
        "haccp/schedules/",
        HaccpScheduleListCreateView.as_view(),
        name="haccp-schedule-list-create",
    ),
    path(
        "haccp/schedules/<uuid:schedule_id>/",
        HaccpScheduleDetailView.as_view(),
        name="haccp-schedule-detail",
    ),
]

urlpatterns += router.urls
