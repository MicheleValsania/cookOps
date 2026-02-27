from django.conf import settings
from django.http import HttpResponse


class SimpleCORSMiddleware:
    allow_methods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    allow_headers = "Content-Type, X-API-Key, Idempotency-Key"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.headers.get("Origin")
        allowed_origin = self._resolve_origin(origin)

        if request.method == "OPTIONS":
            response = HttpResponse(status=200)
        else:
            response = self.get_response(request)

        if allowed_origin:
            response["Access-Control-Allow-Origin"] = allowed_origin
            response["Vary"] = "Origin"
            response["Access-Control-Allow-Methods"] = self.allow_methods
            response["Access-Control-Allow-Headers"] = self.allow_headers

        return response

    def _resolve_origin(self, origin: str | None) -> str | None:
        if not origin:
            return None
        if getattr(settings, "DEBUG", False):
            return origin
        allowlist = set(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
        if origin in allowlist:
            return origin
        return None
