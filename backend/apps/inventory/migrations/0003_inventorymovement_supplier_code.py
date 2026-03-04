from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0002_inventorymovement_site_raw_product_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="inventorymovement",
            name="supplier_code",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
    ]
