from django.db import migrations


def set_accented_name(apps, schema_editor):
    Site = apps.get_model("core", "Site")
    Site.objects.filter(code="PAILLOTTE_SUCREE").update(name="Paillotte Sucrée")


def unset_accented_name(apps, schema_editor):
    Site = apps.get_model("core", "Site")
    Site.objects.filter(code="PAILLOTTE_SUCREE").update(name="Paillotte Sucree")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0002_seed_default_sites"),
    ]

    operations = [
        migrations.RunPython(set_accented_name, unset_accented_name),
    ]
