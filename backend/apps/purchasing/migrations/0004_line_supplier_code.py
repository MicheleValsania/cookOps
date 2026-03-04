from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchasing", "0003_reconciliation_match"),
    ]

    operations = [
        migrations.AddField(
            model_name="goodsreceiptline",
            name="supplier_code",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="supplier_code",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
    ]
