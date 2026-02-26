from rest_framework import mixins, viewsets

from apps.purchasing.api.v1.serializers import GoodsReceiptSerializer
from apps.purchasing.models import GoodsReceipt


class GoodsReceiptViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = GoodsReceipt.objects.all()
    serializer_class = GoodsReceiptSerializer
