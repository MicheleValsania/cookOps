from django.urls import path

from apps.purchasing.api.v1.views import (
    GoodsReceiptViewSet,
    InvoiceGoodsReceiptMatchViewSet,
    InvoiceViewSet,
)


urlpatterns = [
    path(
        "goods-receipts/",
        GoodsReceiptViewSet.as_view({"post": "create"}),
        name="goods-receipt-create",
    ),
    path(
        "invoices/",
        InvoiceViewSet.as_view({"post": "create"}),
        name="invoice-create",
    ),
    path(
        "reconciliation/matches/",
        InvoiceGoodsReceiptMatchViewSet.as_view({"post": "create"}),
        name="reconciliation-match-create",
    ),
]
