import uuid

from django.test import SimpleTestCase, override_settings

from apps.integration.services.traccia_client import TracciaClient


@override_settings(TRACCIA_API_BASE_URL="https://traccia.test", TRACCIA_API_KEY="service-key")
class TracciaClientTests(SimpleTestCase):
    def test_organization_scope_is_added_to_service_requests(self):
        organization_id = uuid.uuid4()

        client = TracciaClient(organization_id)

        self.assertEqual(client._headers()["X-Organization-ID"], str(organization_id))

    def test_explicit_headers_are_preserved(self):
        client = TracciaClient(uuid.uuid4())

        headers = client._headers({"Idempotency-Key": "batch-1"})

        self.assertEqual(headers["Idempotency-Key"], "batch-1")
