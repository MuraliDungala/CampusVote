"""
Eligibility Engine Views.
CampusVote Eligibility Architecture.
"""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.accounts.permissions import IsElectionAdmin
from apps.audit.models import AuditAction
from apps.audit.services import log_audit_event
from apps.students.models import Student
from apps.eligibility.models import ElectionEligibilityRule
from apps.eligibility.serializers import (
    ElectionEligibilityRuleSerializer,
    EligibilityEvaluationRequestSerializer
)
from apps.eligibility.services import EligibilityEngineService


class EligibilityRuleListCreateView(APIView):
    """
    GET /api/v1/admin/eligibility/rules/
    List configured eligibility rules.
    POST /api/v1/admin/eligibility/rules/
    Create a new eligibility rule.
    """
    permission_classes = [IsElectionAdmin]

    def get(self, request, *args, **kwargs):
        rules = ElectionEligibilityRule.objects.all()
        election_id = request.query_params.get('election_id')
        if election_id:
            rules = rules.filter(election_id=election_id)
        serializer = ElectionEligibilityRuleSerializer(rules, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        serializer = ElectionEligibilityRuleSerializer(data=request.data)
        if serializer.is_valid():
            rule = serializer.save()

            log_audit_event(
                action=AuditAction.ELIGIBILITY_RULE_CHANGED,
                target_type='ELIGIBILITY',
                actor=request.user,
                target_id=rule.id,
                metadata={'title': rule.title, 'election_id': str(rule.election_id)},
                request=request
            )

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EligibilityRuleDetailView(APIView):
    """
    GET /api/v1/admin/eligibility/rules/{id}/
    Inspect rule details.
    PATCH /api/v1/admin/eligibility/rules/{id}/
    Update rule parameters.
    """
    permission_classes = [IsElectionAdmin]

    def get(self, request, pk, *args, **kwargs):
        rule = get_object_or_404(ElectionEligibilityRule, pk=pk)
        return Response(ElectionEligibilityRuleSerializer(rule).data, status=status.HTTP_200_OK)

    def patch(self, request, pk, *args, **kwargs):
        rule = get_object_or_404(ElectionEligibilityRule, pk=pk)
        serializer = ElectionEligibilityRuleSerializer(rule, data=request.data, partial=True)
        if serializer.is_valid():
            updated_rule = serializer.save()

            log_audit_event(
                action=AuditAction.ELIGIBILITY_RULE_CHANGED,
                target_type='ELIGIBILITY',
                actor=request.user,
                target_id=updated_rule.id,
                metadata={'title': updated_rule.title, 'updated_fields': list(request.data.keys())},
                request=request
            )

            return Response(ElectionEligibilityRuleSerializer(updated_rule).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EligibilityEvaluateView(APIView):
    """
    POST /api/v1/admin/eligibility/evaluate/
    Evaluates a specific student's eligibility against a configured rule.
    """
    permission_classes = [IsElectionAdmin]

    def post(self, request, *args, **kwargs):
        serializer = EligibilityEvaluationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        college_id = serializer.validated_data['college_id'].strip().upper()
        rule_id = serializer.validated_data['rule_id']

        student = get_object_or_404(Student, college_id=college_id)
        rule = get_object_or_404(ElectionEligibilityRule, pk=rule_id)

        is_eligible, reason = EligibilityEngineService.evaluate_student(student, rule)

        log_audit_event(
            action=AuditAction.ELIGIBILITY_EVALUATED,
            target_type='ELIGIBILITY',
            actor=request.user,
            target_id=student.id,
            metadata={'college_id': student.college_id, 'rule_id': str(rule.id), 'is_eligible': is_eligible, 'reason': reason},
            request=request
        )

        return Response({
            "college_id": student.college_id,
            "full_name": student.full_name,
            "department": student.department,
            "academic_year": student.academic_year,
            "enrollment_status": student.enrollment_status,
            "is_eligible": is_eligible,
            "reason": reason,
            "rule_title": rule.title
        }, status=status.HTTP_200_OK)


class EligibilitySummaryView(APIView):
    """
    GET /api/v1/admin/eligibility/rules/{id}/summary/
    Returns calculated eligible student metrics for the specified rule.
    """
    permission_classes = [IsElectionAdmin]

    def get(self, request, pk, *args, **kwargs):
        rule = get_object_or_404(ElectionEligibilityRule, pk=pk)
        metrics = EligibilityEngineService.get_summary_metrics(rule)
        return Response(metrics, status=status.HTTP_200_OK)
