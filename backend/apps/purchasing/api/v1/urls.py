from django.urls import path

from apps.purchasing.api.v1.views import (
    GoodsReceiptViewSet,
    InvoiceAutoMatchView,
    InvoiceGoodsReceiptMatchViewSet,
    InvoiceViewSet,
)


urlpatterns = [
    path(
        "goods-receipts/",
        GoodsReceiptViewSet.as_view({"get": "list", "post": "create"}),
        name="goods-receipt-create",
    ),
    path(
        "invoices/",
        InvoiceViewSet.as_view({"get": "list", "post": "create"}),
        name="invoice-create",
    ),
    path(
        "reconciliation/matches/",
        InvoiceGoodsReceiptMatchViewSet.as_view({"get": "list", "post": "create"}),
        name="reconciliation-match-create",
    ),
    path(
        "reconciliation/auto-match/",
        InvoiceAutoMatchView.as_view(),
        name="reconciliation-auto-match",
    ),
]
