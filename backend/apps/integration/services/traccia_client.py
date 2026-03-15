import json
import socket
from urllib import error, parse, request

from django.conf import settings


class TracciaClientError(Exception):
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self.payload = payload
        super().__init__(str(payload))


def _json_loads(raw: bytes):
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {"detail": raw.decode("utf-8", errors="replace")}


def _headers(extra_headers: dict | None = None):
    headers = {"Accept": "application/json"}
    if settings.TRACCIA_API_KEY:
        headers["X-API-Key"] = settings.TRACCIA_API_KEY
    if extra_headers:
        headers.update({k: v for k, v in extra_headers.items() if v is not None})
    return headers


class TracciaClient:
    def __init__(self):
        if not settings.TRACCIA_API_BASE_URL:
            raise TracciaClientError(503, {"detail": "TRACCIA_API_BASE_URL is not configured."})
        self.base_url = settings.TRACCIA_API_BASE_URL
        self.timeout = float(settings.TRACCIA_TIMEOUT_SECONDS)

    def _build_url(self, path: str, params: dict | None = None):
        clean_path = path if path.startswith("/") else f"/{path}"
        url = f"{self.base_url}{clean_path}"
        if params:
            encoded = parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
            if encoded:
                url = f"{url}?{encoded}"
        return url

    def request_json(self, method: str, path: str, params: dict | None = None, data=None, headers: dict | None = None):
        payload = None
        req_headers = _headers(headers)
        if data is not None:
            payload = json.dumps(data).encode("utf-8")
            req_headers["Content-Type"] = "application/json"

        req = request.Request(
            url=self._build_url(path, params),
            method=method.upper(),
            data=payload,
            headers=req_headers,
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                status_code = getattr(resp, "status", 200)
                body = _json_loads(resp.read())
                return status_code, body
        except error.HTTPError as exc:
            body = _json_loads(exc.read())
            raise TracciaClientError(exc.code, body) from exc
        except (error.URLError, TimeoutError, socket.timeout) as exc:
            raise TracciaClientError(502, {"detail": f"Cannot reach Traccia backend: {exc}"}) from exc

    def request_bytes(self, method: str, path: str, params: dict | None = None, headers: dict | None = None):
        req = request.Request(
            url=self._build_url(path, params),
            method=method.upper(),
            headers=_headers(headers),
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                status_code = getattr(resp, "status", 200)
                body = resp.read()
                return status_code, dict(resp.headers.items()), body
        except error.HTTPError as exc:
            body = _json_loads(exc.read())
            raise TracciaClientError(exc.code, body) from exc
        except (error.URLError, TimeoutError, socket.timeout) as exc:
            raise TracciaClientError(502, {"detail": f"Cannot reach Traccia backend: {exc}"}) from exc
