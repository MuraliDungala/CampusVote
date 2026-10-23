"""
Election, Position, and Candidate Nomination API Views.
CampusVote Phase 3 Architecture.
"""

from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.db import IntegrityError

from apps.accounts.permissions import IsElectionAdmin, IsStudent, IsActiveAccount, IsActiveOrPublicReadOnly
from apps.accounts.models import Role
from apps.elections.models import Election, ElectionPosition, Candidate, ElectionStatus, CandidateStatus
from apps.elections.serializers import (
    ElectionListSerializer,
    ElectionDetailSerializer,
    ElectionCreateUpdateSerializer,
    ElectionPositionSerializer,
    CandidatePublicSerializer,
    CandidateAdminSerializer,
    NominationCreateUpdateSerializer,
    NominationReviewSerializer,
    ElectionTransitionSerializer,
)
from apps.elections.services import ElectionLifecycleService, CandidateNominationService
from apps.audit.services import log_audit_event
from apps.audit.models import AuditAction


def check_election_organizer_permission(user, election) -> bool:
    """
    Checks if the user has authorization to manage the election.
    Super administrators can manage any election.
    Organizers (created_by == user) can manage their own elections.
    If created_by is None, any election administrator in the same college may manage it.
    Cross-college administration is strictly rejected.
    """
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'role', None) == Role.SUPER_ADMIN or getattr(user, 'is_superuser', False):
        return True
    if getattr(user, 'role', None) == Role.ELECTION_ADMIN:
        # Cross-college access check
        if getattr(user, 'institution_id', None) and getattr(election, 'institution_id', None):
            if user.institution_id != election.institution_id:
                return False
        if election.created_by is None or election.created_by == user:
            return True
        if getattr(user, 'institution_id', None) and getattr(election, 'institution_id', None) and user.institution_id == election.institution_id:
            return True
    return False


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 15
    page_size_query_param = 'page_size'
    max_page_size = 100


# =====================================================================
# Election Views
# =====================================================================

class ElectionListCreateView(APIView):
    """
    List elections (accessible to all authenticated users) or create an election (admin only).
    """
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsElectionAdmin()]
        return [IsActiveOrPublicReadOnly()]

    def get(self, request):
        ElectionLifecycleService.sync_lifecycle_statuses()
        qs = Election.objects.all().select_related('institution', 'created_by').order_by('-created_at')

        # Role-based visibility: Non-admins cannot see DRAFT or CANCELLED elections
        user = request.user
        is_authenticated = bool(user and user.is_authenticated)
        is_admin = is_authenticated and (getattr(user, 'role', None) in ('ELECTION_ADMIN', 'SUPER_ADMIN'))
        is_superuser = is_authenticated and (getattr(user, 'role', None) == 'SUPER_ADMIN' or getattr(user, 'is_superuser', False))

        if not is_admin:
            qs = qs.exclude(status__in=[ElectionStatus.DRAFT, ElectionStatus.CANCELLED])
            if is_authenticated:
                # Filter student elections by institution
                student = getattr(user, 'student_record', None)
                student_inst_id = getattr(student, 'institution_id', None) or getattr(user, 'institution_id', None)
                if student_inst_id:
                    qs = qs.filter(Q(institution_id=student_inst_id) | Q(institution__isnull=True))
            else:
                # For anonymous visitors: filter by optional institution query param
                inst_param = request.query_params.get('institution')
                if inst_param:
                    qs = qs.filter(Q(institution__code__iexact=inst_param) | Q(institution__name__icontains=inst_param))
        else:
            if not is_superuser and getattr(user, 'institution_id', None):
                qs = qs.filter(Q(institution_id=user.institution_id) | Q(institution__isnull=True))

        # Filtering
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())

        academic_year = request.query_params.get('academic_year')
        if academic_year:
            qs = qs.filter(academic_year=academic_year)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

        # Filter by organizer
        if request.query_params.get('my_elections') == 'true' or request.query_params.get('organized_by_me') == 'true':
            qs = qs.filter(created_by=user)

        paginator = self.pagination_class()
        paginated_qs = paginator.paginate_queryset(qs, request)
        serializer = ElectionListSerializer(paginated_qs, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = ElectionCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        save_kwargs = {'created_by': request.user}
        if getattr(request.user, 'institution_id', None):
            save_kwargs['institution'] = request.user.institution

        election = serializer.save(**save_kwargs)

        log_audit_event(
            action=AuditAction.ELECTION_CREATED,
            target_type='ELECTION',
            target_id=str(election.id),
            actor=request.user,
            request=request,
            metadata={
                'title': election.title,
                'academic_year': election.academic_year,
                'institution_id': str(election.institution_id) if election.institution_id else None,
                'start_time': election.start_time.isoformat(),
                'end_time': election.end_time.isoformat(),
            }
        )

        detail_serializer = ElectionDetailSerializer(election)
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)


class ElectionDetailView(APIView):
    """
    Retrieve or update an election cycle.
    """
    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [IsElectionAdmin()]
        return [IsActiveOrPublicReadOnly()]

    def get(self, request, pk):
        ElectionLifecycleService.sync_lifecycle_statuses()
        election = get_object_or_404(Election, pk=pk)
        
        # Check permissions for draft/cancelled elections
        user = request.user
        is_authenticated = bool(user and user.is_authenticated)
        is_admin = is_authenticated and (getattr(user, 'role', None) in ('ELECTION_ADMIN', 'SUPER_ADMIN'))
        is_superuser = is_authenticated and (getattr(user, 'role', None) == 'SUPER_ADMIN' or getattr(user, 'is_superuser', False))

        if not is_admin and election.status in (ElectionStatus.DRAFT, ElectionStatus.CANCELLED):
            return Response(
                {'detail': "You do not have permission to view this unreleased election cycle."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Cross-college access block
        if not is_superuser and election.institution_id:
            if is_authenticated:
                if not is_admin:
                    student = getattr(user, 'student_record', None)
                    student_inst_id = getattr(student, 'institution_id', None) or getattr(user, 'institution_id', None)
                    if student_inst_id and student_inst_id != election.institution_id:
                        return Response(
                            {'detail': "Access denied. This election cycle belongs to another educational institution."},
                            status=status.HTTP_403_FORBIDDEN
                        )
                else:
                    if getattr(user, 'institution_id', None) and user.institution_id != election.institution_id:
                        return Response(
                            {'detail': "Access denied. You do not have permission to manage or view another college's election."},
                            status=status.HTTP_403_FORBIDDEN
                        )

        serializer = ElectionDetailSerializer(election, context={'request': request})
        return Response(serializer.data)

    def patch(self, request, pk):
        election = get_object_or_404(Election, pk=pk)
        if not check_election_organizer_permission(request.user, election):
            return Response(
                {'detail': "You do not have permission to manage this election because you are not its designated organizer."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = ElectionCreateUpdateSerializer(election, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_election = serializer.save()

        log_audit_event(
            action=AuditAction.ELECTION_UPDATED,
            target_type='ELECTION',
            target_id=str(updated_election.id),
            actor=request.user,
            request=request,
            metadata={'updated_fields': list(request.data.keys())}
        )

        detail_serializer = ElectionDetailSerializer(updated_election)
        return Response(detail_serializer.data)


class ElectionSummaryView(APIView):
    """
    Aggregate counts for the Election Admin Dashboard.
    """
    permission_classes = [IsElectionAdmin]

    def get(self, request):
        qs = Election.objects.all()
        user = request.user
        if getattr(user, 'role', None) == Role.ELECTION_ADMIN and not getattr(user, 'is_superuser', False):
            if getattr(user, 'institution_id', None):
                qs = qs.filter(Q(institution_id=user.institution_id) | Q(institution__isnull=True))

        total = qs.count()
        draft = qs.filter(status=ElectionStatus.DRAFT).count()
        scheduled = qs.filter(status=ElectionStatus.SCHEDULED).count()
        active = qs.filter(status=ElectionStatus.ACTIVE).count()
        closed = qs.filter(status=ElectionStatus.CLOSED).count()
        results_published = qs.filter(status=ElectionStatus.RESULTS_PUBLISHED).count()
        archived = qs.filter(status=ElectionStatus.ARCHIVED).count()
        cancelled = qs.filter(status=ElectionStatus.CANCELLED).count()

        candidates_qs = Candidate.objects.filter(election_position__election__in=qs)
        pending_nominations = candidates_qs.filter(
            status__in=[CandidateStatus.SUBMITTED, CandidateStatus.UNDER_REVIEW]
        ).count()

        approved_candidates = candidates_qs.filter(status=CandidateStatus.APPROVED).count()

        return Response({
            'total_elections': total,
            'draft_elections': draft,
            'scheduled_elections': scheduled,
            'active_elections': active,
            'closed_elections': closed,
            'results_published_elections': results_published,
            'archived_elections': archived,
            'cancelled_elections': cancelled,
            'pending_nominations': pending_nominations,
            'approved_candidates': approved_candidates,
        })


class ElectionTransitionBaseView(APIView):
    permission_classes = [IsElectionAdmin]
    transition_action_name = ""

    def execute_transition(self, election, request):
        raise NotImplementedError

    def post(self, request, pk):
        election = get_object_or_404(Election, pk=pk)
        if not check_election_organizer_permission(request.user, election):
            return Response(
                {'detail': "You do not have permission to transition this election because you are not its designated organizer."},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            updated = self.execute_transition(election, request)
            return Response(ElectionDetailSerializer(updated).data)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)


class ElectionScheduleView(ElectionTransitionBaseView):
    def execute_transition(self, election, request):
        return ElectionLifecycleService.schedule(election, actor=request.user, request=request)


class ElectionUnpublishView(ElectionTransitionBaseView):
    """
    POST /api/v1/elections/{id}/unpublish/
    Reverts an election back to DRAFT (unpublished), taking it offline from the student catalogue.
    """
    def execute_transition(self, election, request):
        return ElectionLifecycleService.revert_to_draft(election, actor=request.user, request=request)


class ElectionActivateView(ElectionTransitionBaseView):
    def execute_transition(self, election, request):
        return ElectionLifecycleService.activate(election, actor=request.user, request=request)


class ElectionCloseView(ElectionTransitionBaseView):
    def execute_transition(self, election, request):
        return ElectionLifecycleService.close(election, actor=request.user, request=request)


class ElectionPublishResultsView(ElectionTransitionBaseView):
    def execute_transition(self, election, request):
        return ElectionLifecycleService.publish_results(election, actor=request.user, request=request)


class ElectionArchiveView(ElectionTransitionBaseView):
    def execute_transition(self, election, request):
        return ElectionLifecycleService.archive(election, actor=request.user, request=request)


class ElectionCancelView(ElectionTransitionBaseView):
    def execute_transition(self, election, request):
        serializer = ElectionTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', '')
        return ElectionLifecycleService.cancel(election, actor=request.user, reason=reason, request=request)


# =====================================================================
# Position Views
# =====================================================================

class ElectionPositionListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsElectionAdmin()]
        return [IsActiveOrPublicReadOnly()]

    def get(self, request, election_id):
        election = get_object_or_404(Election, pk=election_id)
        positions = election.positions.all().order_by('display_order', 'created_at')
        serializer = ElectionPositionSerializer(positions, many=True)
        return Response(serializer.data)

    def post(self, request, election_id):
        election = get_object_or_404(Election, pk=election_id)
        if not check_election_organizer_permission(request.user, election):
            return Response(
                {'detail': "You do not have permission to manage positions for this election because you are not its designated organizer."},
                status=status.HTTP_403_FORBIDDEN
            )

        data = request.data.copy()
        data['election'] = str(election.id)

        serializer = ElectionPositionSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            position = serializer.save()
        except IntegrityError:
            return Response(
                {'title': f"A position titled '{data.get('title')}' already exists for this election."},
                status=status.HTTP_400_BAD_REQUEST
            )

        log_audit_event(
            action=AuditAction.POSITION_CREATED,
            target_type='POSITION',
            target_id=str(position.id),
            actor=request.user,
            request=request,
            metadata={
                'title': position.title,
                'election_id': str(election.id),
                'election_title': election.title,
                'display_order': position.display_order,
                'maximum_candidates': position.maximum_candidates,
            }
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ElectionPositionDetailView(APIView):
    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [IsElectionAdmin()]
        return [IsActiveOrPublicReadOnly()]

    def get(self, request, pk):
        position = get_object_or_404(ElectionPosition, pk=pk)
        return Response(ElectionPositionSerializer(position).data)

    def patch(self, request, pk):
        position = get_object_or_404(ElectionPosition, pk=pk)
        if not check_election_organizer_permission(request.user, position.election):
            return Response(
                {'detail': "You do not have permission to modify positions for this election because you are not its designated organizer."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = ElectionPositionSerializer(position, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_position = serializer.save()

        log_audit_event(
            action=AuditAction.POSITION_UPDATED,
            target_type='POSITION',
            target_id=str(updated_position.id),
            actor=request.user,
            request=request,
            metadata={
                'title': updated_position.title,
                'updated_fields': list(request.data.keys())
            }
        )

        return Response(ElectionPositionSerializer(updated_position).data)

    def delete(self, request, pk):
        position = get_object_or_404(ElectionPosition, pk=pk)
        if not check_election_organizer_permission(request.user, position.election):
            return Response(
                {'detail': "You do not have permission to modify positions for this election because you are not its designated organizer."},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            title = position.title
            election_id = str(position.election.id)
            position.delete()

            log_audit_event(
                action=AuditAction.POSITION_DELETED,
                target_type='POSITION',
                target_id=str(pk),
                actor=request.user,
                request=request,
                metadata={'deleted_title': title, 'election_id': election_id}
            )

            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)


# =====================================================================
# Candidate & Nomination Views
# =====================================================================

class ElectionCandidateListView(APIView):
    """
    List candidates for an election.
    Public/Students receive sanitized approved candidates.
    Administrators receive all nominations with filter capabilities.
    """
    permission_classes = [IsActiveOrPublicReadOnly]

    def get(self, request, election_id):
        election = get_object_or_404(Election, pk=election_id)
        user = request.user
        is_authenticated = bool(user and user.is_authenticated)
        is_admin = is_authenticated and (getattr(user, 'role', None) in ('ELECTION_ADMIN', 'SUPER_ADMIN'))

        # Cross-college access check
        if is_authenticated and election.institution_id and not getattr(user, 'is_superuser', False) and getattr(user, 'role', None) != Role.SUPER_ADMIN:
            if not is_admin:
                student = getattr(user, 'student_record', None)
                student_inst_id = getattr(student, 'institution_id', None) or getattr(user, 'institution_id', None)
                if student_inst_id and student_inst_id != election.institution_id:
                    return Response({'detail': "Access denied. Candidate manifest is restricted to the host institution."}, status=status.HTTP_403_FORBIDDEN)
            else:
                if getattr(user, 'institution_id', None) and user.institution_id != election.institution_id:
                    return Response({'detail': "Access denied. You do not have permission to view nominations for another institution."}, status=status.HTTP_403_FORBIDDEN)

        qs = Candidate.objects.filter(election_position__election=election)

        if not is_admin:
            # Public / student voter sees ONLY approved candidates
            qs = qs.filter(status=CandidateStatus.APPROVED)
            serializer = CandidatePublicSerializer(qs, many=True)
            return Response(serializer.data)

        # Admin view: supports status and position filters
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())

        position_id = request.query_params.get('position_id')
        if position_id:
            qs = qs.filter(election_position_id=position_id)

        serializer = CandidateAdminSerializer(qs, many=True)
        return Response(serializer.data)


class PositionCandidateListView(APIView):
    """
    List candidates for a specific position.
    """
    permission_classes = [IsActiveOrPublicReadOnly]

    def get(self, request, position_id):
        position = get_object_or_404(ElectionPosition, pk=position_id)
        election = position.election
        user = request.user
        is_authenticated = bool(user and user.is_authenticated)
        is_admin = is_authenticated and (getattr(user, 'role', None) in ('ELECTION_ADMIN', 'SUPER_ADMIN'))

        # Cross-college access check
        if is_authenticated and election.institution_id and not getattr(user, 'is_superuser', False) and getattr(user, 'role', None) != Role.SUPER_ADMIN:
            if not is_admin:
                student = getattr(user, 'student_record', None)
                student_inst_id = getattr(student, 'institution_id', None) or getattr(user, 'institution_id', None)
                if student_inst_id and student_inst_id != election.institution_id:
                    return Response({'detail': "Access denied. Candidate manifest is restricted to the host institution."}, status=status.HTTP_403_FORBIDDEN)
            else:
                if getattr(user, 'institution_id', None) and user.institution_id != election.institution_id:
                    return Response({'detail': "Access denied. You do not have permission to view nominations for another institution."}, status=status.HTTP_403_FORBIDDEN)

        qs = Candidate.objects.filter(election_position=position)
        if not is_admin:
            qs = qs.filter(status=CandidateStatus.APPROVED)
            serializer = CandidatePublicSerializer(qs, many=True)
        else:
            serializer = CandidateAdminSerializer(qs, many=True)

        return Response(serializer.data)

    def post(self, request, position_id):
        """
        Election Administrator enters / nominates a participating student directly into the election position.
        """
        user = request.user
        if not user or not user.is_authenticated or getattr(user, 'role', None) not in (Role.ELECTION_ADMIN, Role.SUPER_ADMIN):
            return Response(
                {"error": "Authentication required. Only election administrators can add candidates directly."},
                status=status.HTTP_403_FORBIDDEN
            )

        position = get_object_or_404(ElectionPosition, pk=position_id)
        election = position.election

        # Check election organizer / college authorization
        if not check_election_organizer_permission(user, election):
            return Response(
                {"error": "Access denied. You do not have permission to configure candidates for this election."},
                status=status.HTTP_403_FORBIDDEN
            )

        if election.status in (ElectionStatus.CLOSED, ElectionStatus.ARCHIVED, ElectionStatus.CANCELLED):
            return Response(
                {"error": f"Cannot add candidates to an election with status '{election.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        student_raw = request.data.get('student_id') or request.data.get('college_id')
        if not student_raw:
            return Response(
                {"error": "Student identifier ('student_id' or 'college_id') is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.students.models import Student, EnrollmentStatus
        from django.utils import timezone

        student = None
        try:
            student = Student.objects.get(id=student_raw)
        except (Student.DoesNotExist, ValueError, ValidationError):
            student = Student.objects.filter(college_id__iexact=str(student_raw).strip()).first()
            if not student:
                student = Student.objects.filter(email__iexact=str(student_raw).strip()).first()

        if not student:
            return Response(
                {"error": f"No student record found matching '{student_raw}' in the campus registry."},
                status=status.HTTP_404_NOT_FOUND
            )

        if election.institution_id and student.institution_id and student.institution_id != election.institution_id:
            return Response(
                {"error": "Selected student does not belong to the institution hosting this election."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not student.is_active:
            return Response(
                {"error": f"Student {student.full_name} ({student.college_id}) is deactivated and cannot participate in elections."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # If student was PENDING, admin adding them into the election verifies/approves their standing
        if student.enrollment_status == EnrollmentStatus.PENDING:
            student.enrollment_status = EnrollmentStatus.ENROLLED
            student.save(update_fields=['enrollment_status', 'updated_at'])

        if Candidate.objects.filter(election_position=position, student=student).exists():
            return Response(
                {"error": f"Student {student.full_name} ({student.college_id}) is already registered as a candidate for '{position.title}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        approved_count = position.candidates.filter(status=CandidateStatus.APPROVED).count()
        if approved_count >= position.maximum_candidates:
            return Response(
                {"error": f"Position '{position.title}' has reached its maximum candidate capacity of {position.maximum_candidates}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        manifesto = request.data.get('manifesto', '').strip() or f"Official nominated candidate for {position.title}."
        profile_image = request.data.get('profile_image', '').strip()

        # Evaluate candidate eligibility
        is_eligible, reason, snapshot = CandidateNominationService.evaluate_candidate_eligibility(student, election)

        candidate = Candidate.objects.create(
            election_position=position,
            student=student,
            manifesto=manifesto,
            profile_image=profile_image or None,
            status=CandidateStatus.APPROVED,
            submitted_at=timezone.now(),
            reviewed_at=timezone.now(),
            reviewed_by=user,
            eligibility_snapshot=snapshot
        )

        log_audit_event(
            action=AuditAction.NOMINATION_CREATED,
            target_type='NOMINATION',
            target_id=str(candidate.id),
            actor=user,
            request=request,
            metadata={
                'student_id': student.college_id,
                'position': position.title,
                'election_id': str(election.id),
                'source': 'ADMIN_DIRECT_NOMINATION',
            }
        )
        log_audit_event(
            action=AuditAction.NOMINATION_APPROVED,
            target_type='NOMINATION',
            target_id=str(candidate.id),
            actor=user,
            request=request,
            metadata={
                'student_id': student.college_id,
                'position': position.title,
                'election_id': str(election.id),
                'source': 'ADMIN_DIRECT_NOMINATION',
            }
        )

        serializer = CandidateAdminSerializer(candidate)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PositionNominationCreateView(APIView):
    """
    Authenticated student submits or creates a nomination for a position.
    Derives student identity securely from the active session.
    """
    permission_classes = [IsStudent]

    def post(self, request, position_id):
        position = get_object_or_404(ElectionPosition, pk=position_id)
        election = position.election

        # Securely resolve student record
        student = getattr(request.user, 'student_record', None)
        if not student:
            return Response(
                {'error': "Your authenticated account is not linked to an official student registry record."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Cross-college nomination check
        student_inst_id = getattr(student, 'institution_id', None) or getattr(request.user, 'institution_id', None)
        if election.institution_id and student_inst_id and election.institution_id != student_inst_id:
            return Response(
                {'error': "You cannot submit a nomination for an election belonging to another college."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check election status allows nominations
        if election.status not in (ElectionStatus.DRAFT, ElectionStatus.SCHEDULED):
            return Response(
                {'error': f"Nominations are not currently open for election '{election.title}' (Status: {election.status})."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not student.is_active:
            return Response(
                {'error': "Your student registry record is deactivated. Inactive students cannot file nominations."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check existing nomination for this position
        if Candidate.objects.filter(election_position=position, student=student).exists():
            return Response(
                {'error': f"You have already submitted a nomination for position '{position.title}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        manifesto = request.data.get('manifesto', '')
        profile_image = request.data.get('profile_image', '')

        try:
            candidate = Candidate.objects.create(
                election_position=position,
                student=student,
                manifesto=manifesto,
                profile_image=profile_image,
                status=CandidateStatus.DRAFT
            )
        except IntegrityError:
            return Response(
                {'error': "A nomination for this position already exists for your student record."},
                status=status.HTTP_400_BAD_REQUEST
            )

        log_audit_event(
            action=AuditAction.NOMINATION_CREATED,
            target_type='NOMINATION',
            target_id=str(candidate.id),
            actor=request.user,
            request=request,
            metadata={
                'student_id': student.college_id,
                'position': position.title,
                'election_id': str(election.id),
            }
        )

        # Check if direct submit requested
        if request.data.get('submit_now', False):
            try:
                candidate = CandidateNominationService.submit_nomination(
                    candidate,
                    actor=request.user,
                    request=request
                )
            except ValidationError as e:
                msg = e.message if hasattr(e, 'message') else str(e)
                return Response(
                    {'error': msg, 'candidate_draft': CandidateAdminSerializer(candidate).data},
                    status=status.HTTP_400_BAD_REQUEST
                )

        return Response(CandidateAdminSerializer(candidate).data, status=status.HTTP_201_CREATED)


class MyNominationsListView(APIView):
    """
    Returns all nominations filed by the currently authenticated student.
    """
    permission_classes = [IsStudent]

    def get(self, request):
        student = getattr(request.user, 'student_record', None)
        if not student:
            return Response([])

        nominations = Candidate.objects.filter(student=student).order_by('-created_at')
        serializer = CandidateAdminSerializer(nominations, many=True)
        return Response(serializer.data)


class NominationDetailView(APIView):
    """
    Retrieve or update a specific nomination.
    Students can only view/update their own nomination. Administrators can view any.
    """
    permission_classes = [IsActiveAccount]

    def get_candidate(self, pk, user):
        candidate = get_object_or_404(Candidate, pk=pk)
        is_admin = user.role in ('ELECTION_ADMIN', 'SUPER_ADMIN')
        if not is_admin:
            student = getattr(user, 'student_record', None)
            if not student or candidate.student != student:
                return None
        else:
            if not getattr(user, 'is_superuser', False) and user.role != Role.SUPER_ADMIN:
                elec_inst = candidate.election_position.election.institution_id
                if getattr(user, 'institution_id', None) and elec_inst and user.institution_id != elec_inst:
                    return None
        return candidate

    def get(self, request, pk):
        candidate = self.get_candidate(pk, request.user)
        if not candidate:
            return Response({'detail': "Not found or permission denied."}, status=status.HTTP_403_FORBIDDEN)
        return Response(CandidateAdminSerializer(candidate).data)

    def patch(self, request, pk):
        candidate = self.get_candidate(pk, request.user)
        if not candidate:
            return Response({'detail': "Not found or permission denied."}, status=status.HTTP_403_FORBIDDEN)

        # Only DRAFT nominations can have manifesto/image edited
        if candidate.status != CandidateStatus.DRAFT and request.user.role not in ('ELECTION_ADMIN', 'SUPER_ADMIN'):
            return Response(
                {'error': f"Cannot edit nomination details after submission (Current status: {candidate.status})."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if 'manifesto' in request.data:
            candidate.manifesto = request.data['manifesto']
        if 'profile_image' in request.data:
            candidate.profile_image = request.data['profile_image']

        candidate.save()
        return Response(CandidateAdminSerializer(candidate).data)


class NominationSubmitView(APIView):
    """
    Formal submission of a draft nomination by the student.
    Evaluates eligibility criteria against election rules.
    """
    permission_classes = [IsStudent]

    def post(self, request, pk):
        candidate = get_object_or_404(Candidate, pk=pk)
        student = getattr(request.user, 'student_record', None)

        if not student or candidate.student != student:
            return Response(
                {'error': "You can only submit your own candidate nomination."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            submitted = CandidateNominationService.submit_nomination(
                candidate,
                actor=request.user,
                request=request
            )
            return Response(CandidateAdminSerializer(submitted).data)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)


class NominationApproveView(APIView):
    """
    Election administrator approves a submitted nomination.
    Enforces real-time server-side eligibility re-check.
    """
    permission_classes = [IsElectionAdmin]

    def post(self, request, pk):
        candidate = get_object_or_404(Candidate, pk=pk)
        if not check_election_organizer_permission(request.user, candidate.election_position.election):
            return Response(
                {'detail': "You do not have permission to review candidate nominations for this election because you are not its designated organizer."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Prevent student from self-approving even if having admin rights on test account
        student = getattr(request.user, 'student_record', None)
        if student and candidate.student == student:
            return Response(
                {'error': "Self-approval is prohibited. An administrator cannot approve their own candidate nomination."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            approved = CandidateNominationService.review_nomination(
                candidate=candidate,
                action='approve',
                reviewer=request.user,
                request=request
            )
            return Response(CandidateAdminSerializer(approved).data)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)


class NominationRejectView(APIView):
    """
    Election administrator rejects a nomination with mandatory justification.
    """
    permission_classes = [IsElectionAdmin]

    def post(self, request, pk):
        candidate = get_object_or_404(Candidate, pk=pk)
        if not check_election_organizer_permission(request.user, candidate.election_position.election):
            return Response(
                {'detail': "You do not have permission to review candidate nominations for this election because you are not its designated organizer."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = NominationReviewSerializer(data={'action': 'reject', 'rejection_reason': request.data.get('rejection_reason', '')})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            rejected = CandidateNominationService.review_nomination(
                candidate=candidate,
                action='reject',
                reviewer=request.user,
                rejection_reason=serializer.validated_data['rejection_reason'],
                request=request
            )
            return Response(CandidateAdminSerializer(rejected).data)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)


class NominationWithdrawView(APIView):
    """
    Withdraws a nomination. Permitted to the candidate student or an administrator.
    """
    permission_classes = [IsActiveAccount]

    def post(self, request, pk):
        candidate = get_object_or_404(Candidate, pk=pk)
        user = request.user
        is_admin = user.role in ('ELECTION_ADMIN', 'SUPER_ADMIN')
        student = getattr(user, 'student_record', None)

        if not is_admin and (not student or candidate.student != student):
            return Response(
                {'error': "You do not have permission to withdraw this nomination."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            withdrawn = CandidateNominationService.withdraw_nomination(
                candidate=candidate,
                actor=request.user,
                request=request
            )
            return Response(CandidateAdminSerializer(withdrawn).data)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
