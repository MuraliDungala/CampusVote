"""
Serializers for CampusVote Audit Logging System.
Strictly read-only and sanitizes sensitive data.
"""

from rest_framework import serializers
from apps.audit.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """Read-only serializer for security and administrative audit records."""

    class Meta:
        model = AuditLog
        fields = [
            'id',
            'actor_username',
            'actor_role',
            'action',
            'target_type',
            'target_id',
            'metadata',
            'ip_address',
            'created_at',
        ]
        read_only_fields = fields
