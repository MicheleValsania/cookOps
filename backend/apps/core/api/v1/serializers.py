from rest_framework import serializers

from apps.core.models import Site


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
