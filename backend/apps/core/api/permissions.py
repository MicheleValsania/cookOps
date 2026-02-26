from rest_framework.permissions import BasePermission


class HasValidApiKey(BasePermission):
    message = "A valid X-API-Key header is required."

    def has_permission(self, request, view):
        return bool(request.auth)
