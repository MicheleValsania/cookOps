from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import OrganizationMembership


class AuthApiTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_login_issues_a_bearer_session_for_legacy_password(self):
        response = self.client.post(
            "/api/v1/auth/login",
            {"password": "dev-api-key"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()["token"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['token']}")
        status_response = self.client.get("/api/v1/auth/status")
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        self.assertEqual(status_response.json()["organization"]["slug"], "chefside-france")

    def test_login_rejects_invalid_password(self):
        response = self.client.post(
            "/api/v1/auth/login",
            {"password": "wrong-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_bearer_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token")

        response = self.client.get("/api/v1/sites/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_is_rate_limited_after_repeated_failures(self):
        for _ in range(5):
            response = self.client.post(
                "/api/v1/auth/login",
                {"password": "wrong-password"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        blocked = self.client.post(
            "/api/v1/auth/login",
            {"password": "dev-api-key"},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_auth_options_are_public_and_fail_closed_for_registration(self):
        response = self.client.get("/api/v1/auth/options")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["registration_enabled"])
        self.assertTrue(response.json()["legacy_login_enabled"])

    @override_settings(
        COOKOPS_REGISTRATION_ENABLED=True,
        COOKOPS_REGISTRATION_INVITE_CODE="invite-test-code",
    )
    def test_registration_creates_an_isolated_organization_and_personal_session(self):
        response = self.client.post(
            "/api/v1/auth/register",
            {
                "email": "owner@example.com",
                "password": "a-secure-password-123",
                "display_name": "Test Owner",
                "organization_name": "Test Restaurant",
                "invite_code": "invite-test-code",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payload = response.json()
        self.assertEqual(payload["organization"]["name"], "Test Restaurant")
        self.assertEqual(payload["user"]["email"], "owner@example.com")
        membership = OrganizationMembership.objects.get(user__email="owner@example.com")
        self.assertEqual(str(membership.organization_id), payload["organization"]["id"])

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {payload['token']}")
        sites = self.client.get("/api/v1/sites/")
        self.assertEqual(sites.status_code, status.HTTP_200_OK)
        self.assertEqual(sites.json(), [])

    @override_settings(
        COOKOPS_REGISTRATION_ENABLED=True,
        COOKOPS_REGISTRATION_INVITE_CODE="invite-test-code",
    )
    def test_registration_rejects_invalid_invite_and_duplicate_account(self):
        registration = {
            "email": "owner@example.com",
            "password": "a-secure-password-123",
            "display_name": "Test Owner",
            "organization_name": "Test Restaurant",
            "invite_code": "wrong-code",
        }
        invalid = self.client.post("/api/v1/auth/register", registration, format="json")
        self.assertEqual(invalid.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(invalid.json()["code"], "invalid_invite")

        registration["invite_code"] = "invite-test-code"
        created = self.client.post("/api/v1/auth/register", registration, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        duplicate = self.client.post("/api/v1/auth/register", registration, format="json")
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)

    def test_personal_login_uses_membership_and_revocation_invalidates_token(self):
        user = get_user_model().objects.create_user(
            username="member@example.com",
            email="member@example.com",
            password="a-secure-password-123",
        )
        membership = OrganizationMembership.objects.create(
            organization_id="00000000-0000-4000-8000-000000000001",
            user=user,
            role=OrganizationMembership.Role.MANAGER,
        )

        response = self.client.post(
            "/api/v1/auth/login",
            {"email": "member@example.com", "password": "a-secure-password-123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["user"]["role"], "manager")

        token = response.json()["token"]
        membership.is_active = False
        membership.save(update_fields=["is_active"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        revoked = self.client.get("/api/v1/auth/status")
        self.assertEqual(revoked.status_code, status.HTTP_401_UNAUTHORIZED)
