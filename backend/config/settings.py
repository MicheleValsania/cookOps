import os
from pathlib import Path
from urllib.parse import urlparse, unquote


BASE_DIR = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"").strip("'")
        os.environ.setdefault(key, value)


load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.core.apps.CoreConfig",
    "apps.catalog.apps.CatalogConfig",
    "apps.purchasing.apps.PurchasingConfig",
    "apps.inventory.apps.InventoryConfig",
    "apps.pos.apps.PosConfig",
    "apps.integration.apps.IntegrationConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.core.api.cors.SimpleCORSMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

def parse_database_url(raw_url: str) -> dict:
    parsed = urlparse(raw_url)
    if not parsed.scheme:
        return {}
    if parsed.scheme not in ("postgres", "postgresql"):
        return {}
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or ""),
    }


database_url = os.getenv("DATABASE_URL", "").strip()
database_from_url = parse_database_url(database_url) if database_url else {}

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "cookops"),
        "USER": os.getenv("POSTGRES_USER", "cookops"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "cookops"),
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }
}

if database_from_url:
    DATABASES["default"].update({k: v for k, v in database_from_url.items() if v})

if os.getenv("FICHES_DB_NAME"):
    DATABASES["fiches"] = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("FICHES_DB_NAME"),
        "USER": os.getenv("FICHES_DB_USER", ""),
        "PASSWORD": os.getenv("FICHES_DB_PASSWORD", ""),
        "HOST": os.getenv("FICHES_DB_HOST", "localhost"),
        "PORT": os.getenv("FICHES_DB_PORT", "5432"),
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

COOKOPS_API_KEYS = [
    item.strip()
    for item in os.getenv("COOKOPS_API_KEYS", "dev-api-key").split(",")
    if item.strip()
]

CORS_ALLOWED_ORIGINS = [
    item.strip()
    for item in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if item.strip()
]

FICHES_RECIPE_TABLE = os.getenv("FICHES_RECIPE_TABLE", "public.fiches")
FICHES_RECIPE_ID_COLUMN = os.getenv("FICHES_RECIPE_ID_COLUMN", "id")
FICHES_RECIPE_TITLE_COLUMN = os.getenv("FICHES_RECIPE_TITLE_COLUMN", "title")
FICHES_RECIPE_DATA_COLUMN = os.getenv("FICHES_RECIPE_DATA_COLUMN", "data")
FICHES_RECIPE_UPDATED_AT_COLUMN = os.getenv("FICHES_RECIPE_UPDATED_AT_COLUMN", "updated_at")
FICHES_RECIPE_ACTIVE_COLUMN = os.getenv("FICHES_RECIPE_ACTIVE_COLUMN", "")

REST_FRAMEWORK = {
    "DEFAULT_VERSIONING_CLASS": "rest_framework.versioning.URLPathVersioning",
    "DEFAULT_VERSION": "v1",
    "ALLOWED_VERSIONS": ("v1",),
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.core.api.authentication.ApiKeyAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "apps.core.api.permissions.HasValidApiKey",
    ),
    "EXCEPTION_HANDLER": "apps.core.api.exceptions.cookops_exception_handler",
}

TRACCIA_API_BASE_URL = os.getenv("TRACCIA_API_BASE_URL", "").strip().rstrip("/")
TRACCIA_API_KEY = os.getenv("TRACCIA_API_KEY", "").strip()
TRACCIA_TIMEOUT_SECONDS = float(os.getenv("TRACCIA_TIMEOUT_SECONDS", "12"))

GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
GOOGLE_DRIVE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_DRIVE_OAUTH_CLIENT_ID", "").strip()
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET", "").strip()
GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN = os.getenv("GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN", "").strip()
GOOGLE_DRIVE_OAUTH_TOKEN_URI = os.getenv("GOOGLE_DRIVE_OAUTH_TOKEN_URI", "https://oauth2.googleapis.com/token").strip()
GOOGLE_DRIVE_TIMEOUT_SECONDS = float(os.getenv("GOOGLE_DRIVE_TIMEOUT_SECONDS", "20"))
DRIVE_IMPORT_WORKER_ENABLED = os.getenv("DRIVE_IMPORT_WORKER_ENABLED", "false").lower() == "true"
DRIVE_IMPORT_WORKER_INTERVAL_SECONDS = int(os.getenv("DRIVE_IMPORT_WORKER_INTERVAL_SECONDS", "300"))
DRIVE_IMPORT_WORKER_SITE_IDS = [
    item.strip()
    for item in os.getenv("DRIVE_IMPORT_WORKER_SITE_IDS", "").split(",")
    if item.strip()
]
DRIVE_IMPORT_WORKER_DOCUMENT_TYPE = os.getenv("DRIVE_IMPORT_WORKER_DOCUMENT_TYPE", "label_capture").strip() or "label_capture"
DRIVE_IMPORT_WORKER_LIMIT = int(os.getenv("DRIVE_IMPORT_WORKER_LIMIT", "80"))
DRIVE_IMPORT_WORKER_AUTO_EXTRACT = os.getenv("DRIVE_IMPORT_WORKER_AUTO_EXTRACT", "true").lower() == "true"
