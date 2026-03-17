import json
import socket
from urllib import error, parse, request

from django.conf import settings


class DriveClientError(Exception):
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


def _detail_from_payload(payload, fallback: str):
    if isinstance(payload, dict):
        detail = str(payload.get("detail") or "").strip()
        if detail:
            return detail
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            message = str(error_obj.get("message") or "").strip()
            if message:
                return message
    return fallback


class DriveClient:
    def __init__(self):
        self.folder_id = settings.GOOGLE_DRIVE_FOLDER_ID
        self.client_id = settings.GOOGLE_DRIVE_OAUTH_CLIENT_ID
        self.client_secret = settings.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET
        self.refresh_token = settings.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN
        self.token_uri = settings.GOOGLE_DRIVE_OAUTH_TOKEN_URI
        self.timeout = float(settings.GOOGLE_DRIVE_TIMEOUT_SECONDS)
        if not self.folder_id:
            raise DriveClientError(503, {"detail": "GOOGLE_DRIVE_FOLDER_ID is not configured."})
        if not self.client_id or not self.client_secret or not self.refresh_token:
            raise DriveClientError(503, {"detail": "Google Drive OAuth refresh-token credentials are not configured."})

    def _access_token(self) -> str:
        payload = parse.urlencode(
            {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
            }
        ).encode("utf-8")
        req = request.Request(
            url=self.token_uri,
            method="POST",
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                body = _json_loads(resp.read())
        except error.HTTPError as exc:
            body = _json_loads(exc.read())
            raise DriveClientError(exc.code, {"detail": _detail_from_payload(body, "Google OAuth token request failed."), "raw": body}) from exc
        except (error.URLError, TimeoutError, socket.timeout) as exc:
            raise DriveClientError(502, {"detail": f"Cannot reach Google OAuth token endpoint: {exc}"}) from exc

        token = str(body.get("access_token") or "").strip()
        if not token:
            raise DriveClientError(502, {"detail": "Google OAuth token response did not include access_token."})
        return token

    def list_folder_files(self, *, limit: int = 80):
        token = self._access_token()
        rows = []
        next_page_token = ""
        page_size = max(1, min(limit, 200))
        while len(rows) < limit:
            params = {
                "q": f"'{self.folder_id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'",
                "fields": "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)",
                "pageSize": min(page_size, limit - len(rows)),
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
                "orderBy": "createdTime desc",
            }
            if next_page_token:
                params["pageToken"] = next_page_token
            url = f"https://www.googleapis.com/drive/v3/files?{parse.urlencode(params)}"
            req = request.Request(
                url=url,
                method="GET",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
            try:
                with request.urlopen(req, timeout=self.timeout) as resp:
                    body = _json_loads(resp.read())
            except error.HTTPError as exc:
                body = _json_loads(exc.read())
                raise DriveClientError(exc.code, {"detail": _detail_from_payload(body, "Google Drive list request failed."), "raw": body}) from exc
            except (error.URLError, TimeoutError, socket.timeout) as exc:
                raise DriveClientError(502, {"detail": f"Cannot reach Google Drive API: {exc}"}) from exc
            files = body.get("files") if isinstance(body, dict) else []
            if isinstance(files, list):
                rows.extend(files)
            next_page_token = str(body.get("nextPageToken") or "").strip() if isinstance(body, dict) else ""
            if not next_page_token:
                break
        return rows[:limit]

    def download_file(self, file_id: str):
        token = self._access_token()
        url = f"https://www.googleapis.com/drive/v3/files/{parse.quote(file_id)}?alt=media&supportsAllDrives=true"
        req = request.Request(
            url=url,
            method="GET",
            headers={"Authorization": f"Bearer {token}", "Accept": "*/*"},
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                return dict(resp.headers.items()), resp.read()
        except error.HTTPError as exc:
            body = _json_loads(exc.read())
            raise DriveClientError(exc.code, {"detail": _detail_from_payload(body, "Google Drive download failed."), "raw": body}) from exc
        except (error.URLError, TimeoutError, socket.timeout) as exc:
            raise DriveClientError(502, {"detail": f"Cannot download file from Google Drive: {exc}"}) from exc
