from django.apps import AppConfig


class IntegrationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.integration"

    def ready(self):
        from apps.integration.services.drive_worker import maybe_start_drive_import_worker

        maybe_start_drive_import_worker()
