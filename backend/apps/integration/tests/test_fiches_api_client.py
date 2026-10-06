import json
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from apps.integration.fiches_snapshots import _http_get_json


class _FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class FichesApiClientTests(SimpleTestCase):
    @override_settings(FICHES_API_SERVICE_TOKEN="cookops-service-secret")
    @patch("apps.integration.fiches_snapshots.urlopen")
    def test_service_token_is_sent_to_fiches_api(self, mocked_urlopen):
        mocked_urlopen.return_value = _FakeResponse({"ok": True})

        result = _http_get_json("https://fiches.example/api/fiches")

        request = mocked_urlopen.call_args.args[0]
        headers = {name.lower(): value for name, value in request.header_items()}
        self.assertEqual(result, {"ok": True})
        self.assertEqual(headers["x-service-token"], "cookops-service-secret")
        mocked_urlopen.assert_called_once_with(request, timeout=30)

    @override_settings(FICHES_API_SERVICE_TOKEN="")
    @patch("apps.integration.fiches_snapshots.urlopen")
    def test_service_token_header_is_omitted_when_not_configured(self, mocked_urlopen):
        mocked_urlopen.return_value = _FakeResponse([])

        _http_get_json("http://localhost:3001/api/fiches")

        request = mocked_urlopen.call_args.args[0]
        headers = {name.lower(): value for name, value in request.header_items()}
        self.assertNotIn("x-service-token", headers)
