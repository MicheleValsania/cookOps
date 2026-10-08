from django.shortcuts import get_object_or_404

from apps.core.models import Site


def organization_id_for(request):
    return request.user.organization_id


def tenant_sites(request):
    return Site.objects.filter(organization_id=organization_id_for(request))


def get_tenant_site(request, **lookup):
    return get_object_or_404(tenant_sites(request), **lookup)


def tenant_site_ids(request):
    return tenant_sites(request).values_list("id", flat=True)
