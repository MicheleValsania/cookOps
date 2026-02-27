from rest_framework import mixins, viewsets
from rest_framework.exceptions import NotFound

from apps.catalog.api.v1.serializers import SupplierProductSerializer, SupplierSerializer
from apps.catalog.models import Supplier, SupplierProduct


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer


class SupplierProductViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = SupplierProductSerializer

    def get_supplier(self) -> Supplier:
        supplier_id = self.kwargs.get("supplier_id")
        try:
            return Supplier.objects.get(pk=supplier_id)
        except Supplier.DoesNotExist as exc:
            raise NotFound("Supplier not found.") from exc

    def get_queryset(self):
        return SupplierProduct.objects.filter(supplier=self.get_supplier()).order_by("name")

    def perform_create(self, serializer):
        serializer.save(supplier=self.get_supplier())


class SupplierProductCatalogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = SupplierProductSerializer

    def get_queryset(self):
        queryset = SupplierProduct.objects.select_related("supplier").order_by("name")
        active_only = self.request.query_params.get("active")
        if active_only in {"1", "true", "True"}:
            queryset = queryset.filter(active=True)
        query = (self.request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(name__icontains=query)
        return queryset
