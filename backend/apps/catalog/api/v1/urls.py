from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.catalog.api.v1.views import SupplierProductViewSet, SupplierViewSet


router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")

urlpatterns = [
    path(
        "suppliers/<uuid:supplier_id>/products/",
        SupplierProductViewSet.as_view({"get": "list", "post": "create"}),
        name="supplier-products-list-create",
    ),
]

urlpatterns += router.urls
