from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.integration.api.v1.views import DocumentExtractionViewSet, IntegrationDocumentViewSet


router = DefaultRouter()
router.register("integration/documents", IntegrationDocumentViewSet, basename="integration-document")

urlpatterns = [
    path(
        "integration/documents/<uuid:document_id>/extractions/",
        DocumentExtractionViewSet.as_view({"post": "create"}),
        name="integration-document-extraction-create",
    ),
]

urlpatterns += router.urls
