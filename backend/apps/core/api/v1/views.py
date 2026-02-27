from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.api.v1.serializers import SiteSerializer, SiteWriteSerializer
from apps.core.models import Site


class HealthView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({"status": "ok", "service": "cookops", "version": "v1"})


class SiteListView(APIView):
    def get(self, request):
        include_inactive = request.query_params.get("include_inactive") in {"1", "true", "True"}
        queryset = Site.objects.all() if include_inactive else Site.objects.filter(is_active=True)
        queryset = queryset.order_by("name")
        return Response(SiteSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = SiteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        site = serializer.save()
        return Response(SiteSerializer(site).data, status=status.HTTP_201_CREATED)


class SiteDetailView(APIView):
    def patch(self, request, site_id):
        site = get_object_or_404(Site, id=site_id)
        serializer = SiteWriteSerializer(site, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SiteSerializer(site).data)

    def delete(self, request, site_id):
        site = get_object_or_404(Site, id=site_id)
        site.is_active = False
        site.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
