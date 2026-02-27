from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler


def cookops_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, ValidationError):
        response.data = {
            "code": "validation_error",
            "detail": "Request validation failed.",
            "field_errors": response.data,
        }
        return response

    detail = response.data.get("detail") if isinstance(response.data, dict) else response.data
    code = getattr(exc, "default_code", "api_error")

    if response.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        code = "internal_error"
    elif response.status_code == status.HTTP_401_UNAUTHORIZED:
        code = "authentication_failed"
    elif response.status_code == status.HTTP_403_FORBIDDEN:
        code = "permission_denied"
    elif response.status_code == status.HTTP_404_NOT_FOUND:
        code = "not_found"

    response.data = {
        "code": code,
        "detail": str(detail),
        "field_errors": {},
    }
    return response
