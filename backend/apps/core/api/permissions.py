from rest_framework.permissions import BasePermission


class HasValidApiKey(BasePermission):
    message = "A valid X-API-Key header is required."

    def has_permission(self, request, view):
        if request.method == "OPTIONS":
            return True
        return bool(request.auth)
