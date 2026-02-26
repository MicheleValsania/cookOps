from django.urls import path

from apps.purchasing.api.v1.views import GoodsReceiptViewSet


urlpatterns = [
    path(
        "goods-receipts/",
        GoodsReceiptViewSet.as_view({"post": "create"}),
        name="goods-receipt-create",
    ),
]
