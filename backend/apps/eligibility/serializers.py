"""
Serializers for Eligibility Rules and Evaluation.
CampusVote Eligibility Engine.
"""

from rest_framework import serializers
from apps.eligibility.models import ElectionEligibilityRule
from apps.students.models import Student


class ElectionEligibilityRuleSerializer(serializers.ModelSerializer):
    """Serializes configurable election eligibility criteria."""

    class Meta:
        model = ElectionEligibilityRule
        fields = [
            'id',
            'election_id',
            'title',
            'allowed_departments',
            'allowed_academic_years',
            'required_enrollment_statuses',
            'require_active_account',
            'included_student_ids',
            'excluded_student_ids',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_allowed_academic_years(self, value):
        if value:
            for yr in value:
                if not isinstance(yr, int) or not (1 <= yr <= 5):
                    raise serializers.ValidationError("Academic years must be integers between 1 and 5.")
        return value


class EligibilityEvaluationRequestSerializer(serializers.Serializer):
    """Request payload to test or evaluate student voter eligibility."""
    college_id = serializers.CharField(required=True)
    rule_id = serializers.UUIDField(required=True)
