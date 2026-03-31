from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Site
from apps.integration.api.v1.serializers import (
    CleaningBatchCompleteSerializer,
    CleaningCategorySerializer,
    CleaningElementSerializer,
    CleaningPlanGenerateSerializer,
    CleaningPlanSerializer,
    CleaningProcedureSerializer,
)
from apps.integration.models import (
    CleaningCadence,
    CleaningCategory,
    CleaningElement,
    CleaningPlan,
    CleaningProcedure,
)
from apps.integration.services.traccia_client import TracciaClient, TracciaClientError


def _as_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _add_months(day: date, months: int) -> date:
    year = day.year + (day.month - 1 + months) // 12
    month = (day.month - 1 + months) % 12 + 1
    # clamp day to last day of month
    last_day = (date(year + (month // 12), (month % 12) + 1, 1) - timedelta(days=1)).day if month != 12 else 31
    return date(year, month, min(day.day, last_day))


def _generate_due_dates(*, start_date: date, cadence: str, horizon_days: int) -> list[date]:
    today = datetime.now(timezone.utc).date()
    base = max(start_date, today)
    dates: list[date] = []

    if cadence in (CleaningCadence.AFTER_USE,):
        return dates

    if cadence in (CleaningCadence.DAILY, CleaningCadence.END_OF_SERVICE):
        step = timedelta(days=1)
        current = base
        end_date = base + timedelta(days=horizon_days)
        while current <= end_date:
            dates.append(current)
            current += step
        return dates

    if cadence == CleaningCadence.TWICE_WEEKLY:
        step = timedelta(days=3)
        current = base
        end_date = base + timedelta(days=horizon_days)
        while current <= end_date:
            dates.append(current)
            current += step
        return dates

    if cadence == CleaningCadence.WEEKLY:
        step = timedelta(days=7)
        current = base
        end_date = base + timedelta(days=horizon_days)
        while current <= end_date:
            dates.append(current)
            current += step
        return dates

    if cadence == CleaningCadence.FORTNIGHTLY:
        step = timedelta(days=14)
        current = base
        end_date = base + timedelta(days=horizon_days)
        while current <= end_date:
            dates.append(current)
            current += step
        return dates

    if cadence in (CleaningCadence.MONTHLY, CleaningCadence.QUARTERLY, CleaningCadence.SEMIANNUAL, CleaningCadence.ANNUAL):
        months = {
            CleaningCadence.MONTHLY: 1,
            CleaningCadence.QUARTERLY: 3,
            CleaningCadence.SEMIANNUAL: 6,
            CleaningCadence.ANNUAL: 12,
        }[cadence]
        current = base
        end_date = base + timedelta(days=horizon_days)
        while current <= end_date:
            dates.append(current)
            current = _add_months(current, months)
        return dates

    return dates


class CleaningCategoryListCreateView(APIView):
    def get(self, request):
        categories = CleaningCategory.objects.all().order_by("name")
        serializer = CleaningCategorySerializer(categories, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = CleaningCategorySerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(CleaningCategorySerializer(category).data, status=status.HTTP_201_CREATED)


class CleaningCategoryDetailView(APIView):
    def patch(self, request, category_id):
        category = get_object_or_404(CleaningCategory, pk=category_id)
        serializer = CleaningCategorySerializer(category, data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        return Response(CleaningCategorySerializer(category).data, status=status.HTTP_200_OK)

    def delete(self, request, category_id):
        category = get_object_or_404(CleaningCategory, pk=category_id)
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CleaningProcedureListCreateView(APIView):
    def get(self, request):
        qs = CleaningProcedure.objects.all().order_by("name")
        category = (request.query_params.get("category") or "").strip()
        if category:
            qs = qs.filter(category_id=category)
        serializer = CleaningProcedureSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = CleaningProcedureSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        procedure = serializer.save()
        return Response(CleaningProcedureSerializer(procedure).data, status=status.HTTP_201_CREATED)


class CleaningProcedureDetailView(APIView):
    def patch(self, request, procedure_id):
        procedure = get_object_or_404(CleaningProcedure, pk=procedure_id)
        serializer = CleaningProcedureSerializer(procedure, data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        procedure = serializer.save()
        return Response(CleaningProcedureSerializer(procedure).data, status=status.HTTP_200_OK)

    def delete(self, request, procedure_id):
        procedure = get_object_or_404(CleaningProcedure, pk=procedure_id)
        procedure.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CleaningElementListCreateView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        qs = CleaningElement.objects.select_related("category", "procedure").prefetch_related("areas").order_by("name")
        if site_id:
            qs = qs.filter(site_id=site_id)
        serializer = CleaningElementSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = CleaningElementSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        element = serializer.save()
        return Response(CleaningElementSerializer(element).data, status=status.HTTP_201_CREATED)


class CleaningElementDetailView(APIView):
    def patch(self, request, element_id):
        element = get_object_or_404(CleaningElement, pk=element_id)
        serializer = CleaningElementSerializer(element, data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        element = serializer.save()
        return Response(CleaningElementSerializer(element).data, status=status.HTTP_200_OK)

    def delete(self, request, element_id):
        element = get_object_or_404(CleaningElement, pk=element_id)
        element.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CleaningPlanListCreateView(APIView):
    def get(self, request):
        site_id = (request.query_params.get("site") or "").strip()
        qs = CleaningPlan.objects.select_related("element").order_by("-created_at")
        if site_id:
            qs = qs.filter(site_id=site_id)
        serializer = CleaningPlanSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = CleaningPlanSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        return Response(CleaningPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class CleaningPlanDetailView(APIView):
    def patch(self, request, plan_id):
        plan = get_object_or_404(CleaningPlan, pk=plan_id)
        serializer = CleaningPlanSerializer(plan, data=request.data or {}, partial=True)
        serializer.is_valid(raise_exception=True)
        plan = serializer.save()
        return Response(CleaningPlanSerializer(plan).data, status=status.HTTP_200_OK)

    def delete(self, request, plan_id):
        plan = get_object_or_404(CleaningPlan, pk=plan_id)
        plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CleaningPlanGenerateView(APIView):
    def post(self, request):
        serializer = CleaningPlanGenerateSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        plan = get_object_or_404(CleaningPlan.objects.select_related("element", "element__category", "element__procedure", "site"), pk=serializer.validated_data["plan_id"])
        horizon_days = serializer.validated_data["horizon_days"]

        if plan.cadence == CleaningCadence.AFTER_USE:
            return Response({"created": 0, "detail": "after_use cadence does not generate schedules."}, status=status.HTTP_200_OK)

        due_dates = _generate_due_dates(start_date=plan.start_date, cadence=plan.cadence, horizon_days=horizon_days)
        if not due_dates:
            return Response({"created": 0}, status=status.HTTP_200_OK)

        element = plan.element
        category_name = element.category.name if element.category_id else None
        procedure_name = element.procedure.name if element.procedure_id else None
        steps = element.procedure.steps if element.procedure_id else []
        sector_name = plan.sector_name or ""

        client = TracciaClient()
        created = 0
        errors: list[dict] = []
        for day in due_dates:
            due_day = day + timedelta(days=1)
            starts_at = datetime.combine(due_day, plan.due_time).replace(tzinfo=timezone.utc)
            ends_at = starts_at + timedelta(hours=1)
            payload = {
                "site": str(plan.site_id),
                "task_type": "cleaning",
                "title": element.name,
                "area": sector_name or None,
                "sector": str(plan.sector_id) if plan.sector_id else None,
                "sector_label": sector_name or "",
                "sector_code": "",
                "starts_at": _as_iso(starts_at),
                "ends_at": _as_iso(ends_at),
                "status": "planned",
                "recurrence_rule": {},
                "metadata": {
                    "cleaning_plan_id": str(plan.id),
                    "cleaning_element_id": str(element.id),
                    "cleaning_element_name": element.name,
                    "cleaning_category": category_name,
                    "cleaning_procedure": procedure_name,
                    "cleaning_steps": steps,
                    "cleaning_cadence": plan.cadence,
                    "cleaning_sector_id": str(plan.sector_id) if plan.sector_id else None,
                    "cleaning_sector_name": sector_name or None,
                },
            }
            try:
                code, _ = client.request_json("POST", "/api/v1/haccp/schedules/", data=payload)
                if code >= 400:
                    errors.append({"date": str(due_day), "status": code})
                else:
                    created += 1
            except TracciaClientError as exc:
                errors.append({"date": str(due_day), "detail": exc.payload})

        return Response({"created": created, "errors": errors}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class CleaningBatchCompleteView(APIView):
    def post(self, request):
        serializer = CleaningBatchCompleteSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        schedule_ids: Iterable[str] = serializer.validated_data["schedule_ids"]
        client = TracciaClient()
        completed = 0
        errors = []
        for schedule_id in schedule_ids:
            try:
                code, payload = client.request_json(
                    "PATCH",
                    f"/api/v1/haccp/schedules/{schedule_id}/",
                    data={"status": "done"},
                )
                if code >= 400:
                    errors.append({"schedule_id": schedule_id, "detail": payload})
                else:
                    completed += 1
            except TracciaClientError as exc:
                errors.append({"schedule_id": schedule_id, "detail": exc.payload})
        return Response({"completed": completed, "errors": errors}, status=status.HTTP_200_OK)
