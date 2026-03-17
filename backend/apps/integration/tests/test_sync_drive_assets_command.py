from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from apps.core.models import Site


class SyncDriveAssetsCommandTests(TestCase):
    def setUp(self):
        self.site = Site.objects.create(name="Central Site", code="CENTRAL")

    @patch("apps.integration.management.commands.sync_drive_assets.import_drive_assets_for_site")
    def test_command_processes_selected_site(self, import_mock):
        import_mock.return_value = SimpleNamespace(
            created_count=2,
            skipped_existing=1,
            extracted_count=2,
            error_count=0,
        )
        stdout = StringIO()

        call_command("sync_drive_assets", "--site", str(self.site.id), stdout=stdout)

        import_mock.assert_called_once()
        self.assertIn("CENTRAL: new=2 existing=1 extracted=2 errors=0", stdout.getvalue())
