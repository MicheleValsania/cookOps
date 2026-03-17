from unittest.mock import patch

from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Site


@override_settings(TRACCIA_API_BASE_URL="https://traccia.test")
class HaccpLabelApiTests(APITestCase):
    def setUp(self):
        self.client.credentials(HTTP_X_API_KEY="dev-api-key")
        self.site = Site.objects.create(name="Site HACCP", code="SITE-HACCP")

    @patch("apps.integration.api.v1.haccp_views.TracciaClient.request_json")
    def test_label_profile_list_and_create_are_proxied(self, request_json_mock):
        request_json_mock.side_effect = [
            (
                status.HTTP_200_OK,
                {
                    "results": [
                        {
                            "id": "prof-1",
                            "site": str(self.site.id),
                            "name": "Supreme poulet",
                            "category": "Carni",
                            "template_type": "PREPARATION",
                        }
                    ]
                },
            ),
            (
                status.HTTP_201_CREATED,
                {
                    "id": "prof-2",
                    "site": str(self.site.id),
                    "name": "Poisson frais",
                    "category": "Pesci",
                    "template_type": "RAW_MATERIAL",
                },
            ),
        ]

        list_response = self.client.get(f"/api/v1/haccp/label-profiles/?site={self.site.id}")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.json()["results"][0]["id"], "prof-1")

        create_response = self.client.post(
            "/api/v1/haccp/label-profiles/",
            {
                "site": str(self.site.id),
                "name": "Poisson frais",
                "category": "Pesci",
                "template_type": "RAW_MATERIAL",
                "shelf_life_value": 2,
                "shelf_life_unit": "days",
                "packaging": "bac gastro",
                "storage_hint": "0/+2 C",
                "allergens_text": "Poisson",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.json()["id"], "prof-2")
        create_call = request_json_mock.call_args_list[1]
        self.assertEqual(create_call.args[1], "/api/v1/haccp/label-profiles/")
        self.assertEqual(create_call.kwargs["data"]["site"], str(self.site.id))
        self.assertEqual(create_call.kwargs["data"]["category"], "Pesci")

    @patch("apps.integration.api.v1.haccp_views.TracciaClient.request_json")
    def test_label_session_list_and_create_are_proxied(self, request_json_mock):
        request_json_mock.side_effect = [
            (
                status.HTTP_200_OK,
                {
                    "results": [
                        {
                            "id": "sess-1",
                            "site": str(self.site.id),
                            "profile_id": "prof-1",
                            "quantity": 12,
                            "status": "planned",
                        }
                    ]
                },
            ),
            (
                status.HTTP_201_CREATED,
                {
                    "id": "sess-2",
                    "site": str(self.site.id),
                    "profile_id": "prof-1",
                    "quantity": 8,
                    "status": "planned",
                },
            ),
        ]

        list_response = self.client.get(f"/api/v1/haccp/label-sessions/?site={self.site.id}")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.json()["results"][0]["id"], "sess-1")

        create_response = self.client.post(
            "/api/v1/haccp/label-sessions/",
            {
                "site": str(self.site.id),
                "profile_id": "4f1dc6ba-3ebf-4cf0-9b6b-87b0f1ab2b9b",
                "quantity": 8,
                "status": "planned",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.json()["id"], "sess-2")
