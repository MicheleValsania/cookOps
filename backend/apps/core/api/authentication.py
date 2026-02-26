from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from rest_framework import authentication, exceptions


class ApiKeyAuthentication(authentication.BaseAuthentication):
    header_name = "HTTP_X_API_KEY"

    def authenticate(self, request):
        api_key = request.META.get(self.header_name)
        if not api_key:
            return None

        valid_keys = set(getattr(settings, "COOKOPS_API_KEYS", []))
        if api_key not in valid_keys:
            raise exceptions.AuthenticationFailed("Invalid API key.")

        return (AnonymousUser(), api_key)
