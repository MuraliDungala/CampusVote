"""
API Views for Anonymous Ballot Presentation, Validation, and Submission.
CampusVote Smart ID-Based College Voting System - Phase 5 Architecture.
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsStudent
from apps.elections.models import Election
from apps.students.models import Student
from apps.voting.models import VoterParticipationRecord
from apps.voting.serializers import (
    BallotSubmissionSerializer,
    VoterParticipationStatusSerializer
)
from apps.voting.services import (
    BallotDefinitionService,
    BallotValidationService,
    ParticipationService,
    AnonymousBallotService
)


class BallotDefinitionView(APIView):
    """
    GET /api/v1/elections/{election_id}/ballot/
    Retrieves the authoritative ballot structure for an election cycle.
    Returns election details, positions, approved candidate rosters, and selection rules.
    Requires student authentication.
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request, election_id, *args, **kwargs):
        user = request.user
        student = getattr(user, 'student_record', None) or Student.objects.filter(college_id=user.college_id).first()

        election = Election.objects.filter(id=election_id).first()
        if not election:
            return Response({"error": "Election not found."}, status=status.HTTP_404_NOT_FOUND)

        success, ballot_data, error_msg = BallotDefinitionService.get_ballot_definition(
            election_id=str(election_id),
            student=student
        )

        if not success:
            return Response(
                {"error": error_msg, "details": ballot_data},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check eligibility and participation status to guide frontend UX
        is_eligible, elig_reason, elig_meta = ParticipationService.check_student_voter_eligibility(user, election)
        ballot_data['voter_status'] = {
            'is_eligible': is_eligible,
            'reason': elig_reason if not is_eligible else 'Eligible to vote',
            'code': elig_meta.get('code', 'UNKNOWN'),
            'requires_verification': elig_meta.get('requires_verification', False),
            'has_participated': elig_meta.get('has_participated', False),
        }

        return Response(ballot_data, status=status.HTTP_200_OK)


class BallotValidateView(APIView):
    """
    POST /api/v1/elections/{election_id}/ballot/validate/
    Pre-validates voter selections against election positions and approved candidates
    prior to final submission. Does not write to vote vault.
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def post(self, request, election_id, *args, **kwargs):
        election = Election.objects.filter(id=election_id).first()
        if not election:
            return Response({"error": "Election not found."}, status=status.HTTP_404_NOT_FOUND)

        student = getattr(request.user, 'student_record', None) or Student.objects.filter(college_id=request.user.college_id).first()
        if student and election.institution_id:
            student_inst_id = student.institution_id or getattr(request.user, 'institution_id', None)
            if student_inst_id and student_inst_id != election.institution_id:
                return Response({"error": "You cannot validate ballot selections for an election from another institution."}, status=status.HTTP_403_FORBIDDEN)

        serializer = BallotSubmissionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid ballot payload structure.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        raw_selections = serializer.validated_data['selections']
        is_valid, validated_entries, error_msg = BallotValidationService.validate_selections(
            election=election,
            raw_selections=raw_selections
        )

        if not is_valid:
            return Response(
                {"error": error_msg, "is_valid": False},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            "is_valid": True,
            "message": "All position selections and abstentions are valid.",
            "total_positions": len(validated_entries)
        }, status=status.HTTP_200_OK)


class BallotSubmitView(APIView):
    """
    POST /api/v1/elections/{election_id}/ballot/submit/
    Submits a validated ballot through the decoupled anonymous submission engine.
    Atomically records student participation on the identity side and writes
    the anonymous ballot into the vote vault without any identity linkage.
    Returns a generic submission receipt.
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def post(self, request, election_id, *args, **kwargs):
        serializer = BallotSubmissionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid ballot submission format.", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        client_ip = request.META.get('HTTP_X_FORWARDED_FOR') or request.META.get('REMOTE_ADDR')
        if client_ip:
            client_ip = client_ip.split(',')[0].strip()

        raw_selections = serializer.validated_data['selections']

        success, data, error_msg = AnonymousBallotService.submit_ballot(
            election_id=str(election_id),
            user=request.user,
            raw_selections=raw_selections,
            ip_address=client_ip,
            request=request
        )

        if not success:
            http_status = status.HTTP_400_BAD_REQUEST
            if data.get('code') == 'ALREADY_PARTICIPATED':
                http_status = status.HTTP_409_CONFLICT
            elif data.get('code') in ('UNAUTHENTICATED', 'NOT_STUDENT', 'CROSS_INSTITUTION_FORBIDDEN'):
                http_status = status.HTTP_403_FORBIDDEN
            return Response(
                {"error": error_msg, "details": data},
                status=http_status
            )

        return Response(data, status=status.HTTP_201_CREATED)


class VoterParticipationStatusView(APIView):
    """
    GET /api/v1/elections/{election_id}/participation/status/
    Reports whether the authenticated student has already cast a ballot in this election.
    Exposes zero ballot or vote choice data.
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request, election_id, *args, **kwargs):
        user = request.user
        student = getattr(user, 'student_record', None) or Student.objects.filter(college_id=user.college_id).first()

        election = Election.objects.filter(id=election_id).first()
        if not election:
            return Response({"error": "Election not found."}, status=status.HTTP_404_NOT_FOUND)

        if not student:
            return Response(
                {"error": "Student registry record not found for this user account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if election.institution_id:
            student_inst_id = student.institution_id or getattr(user, 'institution_id', None)
            if student_inst_id and student_inst_id != election.institution_id:
                return Response({"error": "You do not have access to elections from another institution."}, status=status.HTTP_403_FORBIDDEN)

        participation = VoterParticipationRecord.objects.filter(
            election=election,
            student=student
        ).first()

        is_eligible, reason, meta = ParticipationService.check_student_voter_eligibility(user, election)

        return Response({
            'election_id': str(election.id),
            'has_participated': participation is not None,
            'participated_at': participation.participated_at.isoformat() if participation else None,
            'is_eligible': is_eligible,
            'requires_verification': meta.get('requires_verification', False),
            'message': "Participation status evaluated."
        }, status=status.HTTP_200_OK)
