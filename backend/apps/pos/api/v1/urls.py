from django.urls import path

from apps.pos.api.v1.views import SalesEventDailyImportViewSet


urlpatterns = [
    path(
        "pos/import/daily/",
        SalesEventDailyImportViewSet.as_view({"post": "create"}),
        name="pos-import-daily",
    ),
]
