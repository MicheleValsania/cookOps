from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase


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
