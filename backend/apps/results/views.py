"""
API Views for Election Results Management, Verification, and Reporting.
CampusVote Phase 8 Architecture.

Restricted administrative endpoints enforce Role-Based Access Control (RBAC).
Public endpoints strictly return approved aggregate results only.
"""

import logging
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from apps.accounts.permissions import IsElectionAdmin, IsAuditor
from apps.elections.models import Election, ElectionStatus
from apps.audit.models import AuditLog, AuditAction
from apps.audit.services import log_audit_event
from apps.results.models import ElectionResult, ResultLifecycleStatus
from apps.results.services import ResultWorkflowService
from apps.results.serializers import (
    ElectionResultListSerializer,
    ElectionResultDetailSerializer,
    PublicElectionResultSerializer,
    CalculateResultRequestSerializer,
    ReviewResultRequestSerializer,
    ApproveResultRequestSerializer
)

logger = logging.getLogger(__name__)


class AdminResultsBaseView(APIView):
    """Base authorization class ensuring Election Admin or Super Admin access."""
    permission_classes = [IsElectionAdmin]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        election_id = kwargs.get("election_id")
        if election_id:
            election = Election.objects.filter(id=election_id).first()
            if election and election.institution_id:
                user = request.user
                is_superuser = getattr(user, 'role', None) == 'SUPER_ADMIN' or getattr(user, 'is_superuser', False)
                if not is_superuser and getattr(user, 'institution_id', None):
                    if user.institution_id != election.institution_id:
                        self.permission_denied(
                            request,
                            message="You do not have permission to access results for another institution's election.",
                            code="CROSS_INSTITUTION_FORBIDDEN"
                        )


class ElectionResultListView(AdminResultsBaseView):
    """
    GET /api/v1/admin/elections/{election_id}/results/
    Lists available result calculation versions for an election.
    """

    def get(self, request, election_id):
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return Response({"error": "Election cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        results = ElectionResult.objects.filter(election=election).order_by('-version')
        serializer = ElectionResultListSerializer(results, many=True)
        return Response({
            "election_id": str(election.id),
            "election_title": election.title,
            "election_status": election.status,
            "total_versions": len(results),
            "results": serializer.data
        }, status=status.HTTP_200_OK)


class ElectionResultCalculateView(AdminResultsBaseView):
    """
    POST /api/v1/admin/elections/{election_id}/results/calculate/
    Initiates deterministic tally calculation for an election cycle.
    """

    def post(self, request, election_id):
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return Response({"error": "Election cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        req_serializer = CalculateResultRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        use_synthetic = req_serializer.validated_data.get('use_synthetic', False)

        success, result, blockers, error_msg = ResultWorkflowService.calculate_result(
            election_id=str(election.id),
            user=request.user,
            use_synthetic=use_synthetic,
            request=request
        )

        if not success:
            return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionResultDetailSerializer(result)
        return Response({
            "message": "Result calculation completed successfully.",
            "publication_blockers": blockers,
            "result": serializer.data,
            **serializer.data
        }, status=status.HTTP_201_CREATED)


class ElectionResultDetailView(AdminResultsBaseView):
    """
    GET /api/v1/admin/elections/{election_id}/results/{result_id}/
    Retrieves complete aggregate calculation details for a specific version.
    """

    def get(self, request, election_id, result_id):
        result = ElectionResult.objects.filter(
            id=result_id,
            election_id=election_id
        ).first()

        if not result:
            return Response({"error": "Result calculation version not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ElectionResultDetailSerializer(result)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ElectionResultVerificationView(AdminResultsBaseView):
    """
    GET /api/v1/admin/elections/{election_id}/results/{result_id}/verification/
    Retrieves verification findings: ballot integrity, reconciliation, digest, and publication gates.
    """

    def get(self, request, election_id, result_id):
        result = ElectionResult.objects.filter(
            id=result_id,
            election_id=election_id
        ).first()

        if not result:
            return Response({"error": "Result calculation version not found."}, status=status.HTTP_404_NOT_FOUND)

        # Reproducibility check
        import json, hashlib
        canonical_str = json.dumps(result.aggregate_snapshot, sort_keys=True, separators=(',', ':'))
        recomputed_digest = hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()
        digest_match = (recomputed_digest == result.result_digest)

        return Response({
            "result_id": str(result.id),
            "version": result.version,
            "status": result.status,
            "lifecycle_status": result.status,
            "is_synthetic": result.is_synthetic,
            "tally_source_type": result.tally_source_type,
            "stored_result_digest": result.result_digest,
            "recomputed_digest": recomputed_digest,
            "reproducibility": digest_match,
            "reproducibility_verified": digest_match,
            "integrity_status": result.integrity_status,
            "integrity_verification_status": result.integrity_status,
            "integrity_details": result.integrity_details,
            "reconciliation_status": result.reconciliation_status,
            "reconciliation_details": result.reconciliation_details,
            "publication_blockers": result.publication_blockers,
            "publication_eligible": len(result.publication_blockers) == 0 and result.status == ResultLifecycleStatus.APPROVED,
            "is_publication_eligible": len(result.publication_blockers) == 0 and result.status == ResultLifecycleStatus.APPROVED
        }, status=status.HTTP_200_OK)


class ElectionResultReviewView(AdminResultsBaseView):
    """
    POST /api/v1/admin/elections/{election_id}/results/{result_id}/review/
    Submits an administrative review decision (ACCEPTED or REJECTED).
    """

    def post(self, request, election_id, result_id):
        req_serializer = ReviewResultRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        decision = req_serializer.validated_data['decision']
        notes = req_serializer.validated_data.get('notes', '')

        success, result, error_msg = ResultWorkflowService.submit_review(
            result_id=result_id,
            user=request.user,
            decision=decision,
            notes=notes,
            request=request
        )

        if not success:
            return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionResultDetailSerializer(result)
        return Response({
            "message": f"Review decision '{decision}' recorded successfully.",
            "result": serializer.data
        }, status=status.HTTP_200_OK)


class ElectionResultApproveView(AdminResultsBaseView):
    """
    POST /api/v1/admin/elections/{election_id}/results/{result_id}/approve/
    Grants administrative approval for publication. Enforces Separation of Duties.
    """

    def post(self, request, election_id, result_id):
        req_serializer = ApproveResultRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        notes = req_serializer.validated_data.get('notes', '')

        try:
            result = ResultWorkflowService.approve_result(
                result=result_id,
                user=request.user,
                notes=notes,
                request=request
            )
        except PermissionError as pe:
            return Response({"error": str(pe)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionResultDetailSerializer(result)
        return Response({
            "message": "Result version approved for publication.",
            "result": serializer.data,
            **serializer.data
        }, status=status.HTTP_200_OK)


class ElectionResultPublishView(AdminResultsBaseView):
    """
    POST /api/v1/admin/elections/{election_id}/results/{result_id}/publish/
    Publishes approved election results if every security and publication gate passes.
    """

    def post(self, request, election_id, result_id):
        try:
            result = ResultWorkflowService.publish_result(
                result=result_id,
                user=request.user,
                request=request
            )
        except PermissionError as pe:
            return Response({
                "error": str(pe),
                "failed_gates": [str(pe)]
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ElectionResultDetailSerializer(result)
        return Response({
            "message": "Election results published successfully.",
            "result": serializer.data,
            **serializer.data
        }, status=status.HTTP_200_OK)


class ElectionResultAuditView(AdminResultsBaseView):
    """
    GET /api/v1/admin/elections/{election_id}/results/{result_id}/audit/
    Retrieves authorized audit trail events associated with this election result.
    """

    def get(self, request, election_id, result_id):
        logs = AuditLog.objects.filter(
            target_id=str(result_id)
        ).order_by('-created_at')

        audit_data = [
            {
                'id': str(log.id),
                'action': log.action,
                'action_display': log.get_action_display(),
                'actor_username': log.actor_username,
                'actor_role': log.actor_role,
                'metadata': log.metadata,
                'timestamp': log.created_at.isoformat()
            }
            for log in logs
        ]

        return Response({
            "result_id": str(result_id),
            "total_audit_events": len(audit_data),
            "events": audit_data
        }, status=status.HTTP_200_OK)


class ElectionResultReportExportView(AdminResultsBaseView):
    """
    GET /api/v1/admin/elections/{election_id}/results/{result_id}/report/
    Exports a standardized, aggregate CSV results report.
    """

    def get(self, request, election_id, result_id):
        result = ElectionResult.objects.filter(
            id=result_id,
            election_id=election_id
        ).first()

        if not result:
            return Response({"error": "Result calculation version not found."}, status=status.HTTP_404_NOT_FOUND)

        csv_content = ResultWorkflowService.generate_report_csv(result)

        log_audit_event(
            action=AuditAction.RESULT_REPORT_EXPORTED,
            target_type='ELECTION_RESULT',
            target_id=str(result.id),
            metadata={'version': result.version, 'format': 'CSV'},
            request=request
        )

        response = HttpResponse(csv_content, content_type='text/csv')
        filename = f"election_{str(election_id)[:8]}_results_v{result.version}.csv"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


# ==============================================================================
# PUBLIC ENDPOINT
# ==============================================================================

class PublicElectionResultView(APIView):
    """
    GET /api/v1/public/elections/{election_id}/results/
    Publicly accessible endpoint for officially published election results.
    Strictly excludes unpublished versions, private notes, and raw ballot selections.
    """
    permission_classes = [AllowAny]

    def get(self, request, election_id):
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return Response({"error": "Election cycle not found."}, status=status.HTTP_404_NOT_FOUND)

        # Student institution check
        if request.user and request.user.is_authenticated and getattr(request.user, 'role', None) == 'STUDENT':
            student = getattr(request.user, 'student_record', None)
            student_inst_id = getattr(student, 'institution_id', None) or getattr(request.user, 'institution_id', None)
            if election.institution_id and student_inst_id and election.institution_id != student_inst_id:
                return Response(
                    {"detail": "Access denied. Official results are restricted to the institution hosting the election."},
                    status=status.HTTP_403_FORBIDDEN
                )

        # Retrieve the currently published result version
        published_result = ElectionResult.objects.filter(
            election=election,
            status=ResultLifecycleStatus.PUBLISHED
        ).order_by('-version').first()

        if not published_result:
            return Response(
                {"detail": "No published results: Official election results have not yet been published for this election cycle."},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = PublicElectionResultSerializer(published_result)
        return Response(serializer.data, status=status.HTTP_200_OK)
