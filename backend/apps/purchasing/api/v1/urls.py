from django.urls import path

from apps.purchasing.api.v1.views import GoodsReceiptViewSet, InvoiceViewSet


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
]
