from rest_framework import serializers

from apps.core.models import ServiceMenuEntry, Site


class SiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ("id", "name", "code", "is_active")


class SiteWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Site
        fields = ("name", "code", "is_active")
        extra_kwargs = {"is_active": {"required": False}}

    def validate_code(self, value):
        normalized = value.strip().upper().replace(" ", "_")
        if not normalized:
            raise serializers.ValidationError("Il codice punto vendita e' obbligatorio.")
        return normalized


class ServiceMenuEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceMenuEntry
        fields = (
            "id",
            "site",
            "service_date",
            "space_key",
            "section",
            "title",
            "fiche_product_id",
            "expected_qty",
            "sort_order",
            "is_active",
            "metadata",
        )


class ServiceMenuEntrySyncItemSerializer(serializers.Serializer):
    space_key = serializers.CharField(max_length=64)
    section = serializers.CharField(max_length=128, required=False, allow_blank=True)
    title = serializers.CharField(max_length=255)
    fiche_product_id = serializers.UUIDField(required=False, allow_null=True)
    expected_qty = serializers.DecimalField(max_digits=12, decimal_places=3, required=False, default="1")
    sort_order = serializers.IntegerField(required=False, default=0)
    is_active = serializers.BooleanField(required=False, default=True)
    metadata = serializers.JSONField(required=False, default=dict)


class ServiceMenuEntrySyncSerializer(serializers.Serializer):
    site_id = serializers.UUIDField()
    service_date = serializers.DateField()
    entries = ServiceMenuEntrySyncItemSerializer(many=True)
