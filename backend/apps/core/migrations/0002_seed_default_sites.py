from django.db import migrations


def seed_sites(apps, schema_editor):
    Site = apps.get_model("core", "Site")
    defaults = [
        {"name": "Le Jardin des Pins", "code": "LE_JARDIN_DES_PINS"},
        {"name": "Paillotte Snack Bar", "code": "PAILLOTTE_SNACK_BAR"},
        {"name": "Paillotte Sucree", "code": "PAILLOTTE_SUCREE"},
        {"name": "Paillotte Cocktail Bar", "code": "PAILLOTTE_COCKTAIL_BAR"},
    ]
    for item in defaults:
        Site.objects.update_or_create(code=item["code"], defaults={"name": item["name"], "is_active": True})


def unseed_sites(apps, schema_editor):
    Site = apps.get_model("core", "Site")
    codes = [
        "LE_JARDIN_DES_PINS",
        "PAILLOTTE_SNACK_BAR",
        "PAILLOTTE_SUCREE",
        "PAILLOTTE_COCKTAIL_BAR",
    ]
    Site.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_sites, unseed_sites),
    ]

