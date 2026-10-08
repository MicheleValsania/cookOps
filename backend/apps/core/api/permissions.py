from rest_framework.permissions import BasePermission


class HasValidApiKey(BasePermission):
    message = "Authentication credentials were not provided."

    def has_permission(self, request, view):
        if request.method == "OPTIONS":
            return True
        return bool(request.auth)
