#!/usr/bin/env bash
set -euo pipefail

python manage.py sync_drive_assets --all-sites
