"""
Views for CampusVote Audit Logging System.
Provides restricted access to audit trail for authorized security auditors.
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from apps.accounts.permissions import IsAuditor
from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer


class AuditLogPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class AuditLogListView(APIView):
    """
    GET /api/v1/audit/logs/
    Retrieves read-only audit logs. Restricted strictly to Auditor and Super Admin roles.
    """
    permission_classes = [IsAuditor]
    pagination_class = AuditLogPagination

    def get(self, request):
        qs = AuditLog.objects.all().order_by('-created_at')

        # Optional filters
        action = request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)

        target_type = request.query_params.get('target_type')
        if target_type:
            qs = qs.filter(target_type=target_type)

        target_id = request.query_params.get('target_id')
        if target_id:
            qs = qs.filter(target_id=target_id)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        serializer = AuditLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
