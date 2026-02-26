from rest_framework import mixins, viewsets

from apps.pos.api.v1.serializers import SalesEventDailyImportSerializer
from apps.pos.models import SalesEventDaily


class SalesEventDailyImportViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = SalesEventDaily.objects.all()
    serializer_class = SalesEventDailyImportSerializer
