from django.conf import settings
from dataclasses import dataclass

from rest_framework import authentication, exceptions

from apps.core.models import Organization, OrganizationMembership
from apps.core.api.tokens import read_access_token


@dataclass(frozen=True)
class CookOpsPrincipal:
    organization: Organization
    user: object | None = None
    role: str = "owner"
    kind: str = "legacy_api_key"

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def organization_id(self):
        return self.organization.id

    @property
    def id(self):
        return getattr(self.user, "id", None)


class ApiKeyAuthentication(authentication.BaseAuthentication):
    header_name = "HTTP_X_API_KEY"

    def authenticate_header(self, request):
        return "Bearer"

    def authenticate(self, request):
        authorization = request.META.get("HTTP_AUTHORIZATION", "")
        if authorization.startswith("Bearer "):
            payload = read_access_token(authorization[7:].strip())
            if not payload:
                raise exceptions.AuthenticationFailed("Invalid or expired session.")
            try:
                organization = Organization.objects.get(
                    id=payload.get("organization_id"),
                    is_active=True,
                )
            except (Organization.DoesNotExist, ValueError, TypeError) as exc:
                raise exceptions.AuthenticationFailed("Session organization is unavailable.") from exc
            user_id = payload.get("user_id")
            if user_id:
                try:
                    membership = OrganizationMembership.objects.select_related("user").get(
                        organization=organization,
                        user_id=user_id,
                        user__is_active=True,
                        is_active=True,
                    )
                except (OrganizationMembership.DoesNotExist, ValueError, TypeError) as exc:
                    raise exceptions.AuthenticationFailed("Session membership is unavailable.") from exc
                return (
                    CookOpsPrincipal(
                        organization=organization,
                        user=membership.user,
                        role=membership.role,
                        kind="personal",
                    ),
                    payload,
                )
            return (
                CookOpsPrincipal(
                    organization=organization,
                    role=str(payload.get("role") or "viewer"),
                    kind=str(payload.get("kind") or "session"),
                ),
                payload,
            )

        api_key = request.META.get(self.header_name)
        if not api_key:
            return None

        valid_keys = set(getattr(settings, "COOKOPS_API_KEYS", []))
        if api_key not in valid_keys:
            raise exceptions.AuthenticationFailed("Invalid API key.")

        try:
            organization = Organization.objects.get(
                id=settings.DEFAULT_ORGANIZATION_ID,
                is_active=True,
            )
        except Organization.DoesNotExist as exc:
            raise exceptions.AuthenticationFailed("Default organization is not configured.") from exc

        return (CookOpsPrincipal(organization=organization), api_key)
