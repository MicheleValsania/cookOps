from rest_framework import serializers

from apps.core.models import Site
from apps.pos.models import PosSource, SalesEventDaily


class SalesEventDailyImportSerializer(serializers.ModelSerializer):
    site_id = serializers.UUIDField(write_only=True)
    pos_source_id = serializers.UUIDField(write_only=True)
    lines = serializers.ListField(write_only=True, allow_empty=True)

    class Meta:
        model = SalesEventDaily
        fields = (
            "id",
            "site_id",
            "pos_source_id",
            "sales_date",
            "lines",
            "payload",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        site_id = attrs.pop("site_id", None)
        pos_source_id = attrs.pop("pos_source_id", None)

        try:
            site = Site.objects.get(pk=site_id)
        except Site.DoesNotExist as exc:
            raise serializers.ValidationError({"site_id": "Invalid site_id."}) from exc

        try:
            pos_source = PosSource.objects.get(pk=pos_source_id)
        except PosSource.DoesNotExist as exc:
            raise serializers.ValidationError({"pos_source_id": "Invalid pos_source_id."}) from exc

        if pos_source.site_id != site.id:
            raise serializers.ValidationError(
                {"pos_source_id": "pos_source_id does not belong to the provided site_id."}
            )

        attrs["site"] = site
        attrs["pos_source"] = pos_source
        return attrs

    def create(self, validated_data):
        lines = validated_data.pop("lines", [])
        payload = validated_data.get("payload", {})
        payload["lines"] = lines
        validated_data["payload"] = payload
        return super().create(validated_data)
