from django.urls import path

from apps.inventory.api.v1.views import InventoryApplyView, InventoryMovementViewSet, InventoryStockSummaryView


urlpatterns = [
    path(
        "inventory/movements/",
        InventoryMovementViewSet.as_view({"get": "list"}),
        name="inventory-movement-list",
    ),
    path(
        "inventory/stock-summary/",
        InventoryStockSummaryView.as_view(),
        name="inventory-stock-summary",
    ),
    path(
        "inventory/inventories/apply/",
        InventoryApplyView.as_view(),
        name="inventory-apply",
    ),
]
