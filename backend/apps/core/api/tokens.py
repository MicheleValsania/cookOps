from django.conf import settings
from django.core import signing


TOKEN_SALT = "cookops.access.v1"


def issue_access_token(*, organization_id, role: str = "owner", kind: str = "legacy") -> str:
    return signing.dumps(
        {
            "organization_id": str(organization_id),
            "role": role,
            "kind": kind,
        },
        key=settings.SECRET_KEY,
        salt=TOKEN_SALT,
        compress=True,
    )


def read_access_token(token: str) -> dict | None:
    try:
        payload = signing.loads(
            token,
            key=settings.SECRET_KEY,
            salt=TOKEN_SALT,
            max_age=settings.COOKOPS_SESSION_TTL_SECONDS,
        )
    except (signing.BadSignature, signing.SignatureExpired):
        return None
    return payload if isinstance(payload, dict) else None
