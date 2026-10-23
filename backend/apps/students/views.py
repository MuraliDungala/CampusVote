"""
Administrative Student Registry and Roster Views.
CampusVote Student Architecture.
"""

from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from apps.accounts.permissions import IsElectionAdmin
from apps.accounts.models import Role, AccountStatus, Institution, InstitutionStatus
from apps.audit.models import AuditAction
from apps.audit.services import log_audit_event
from apps.students.models import Student, ImportSession, ImportSessionStatus, INSTITUTIONAL_DEPARTMENTS
from apps.students.serializers import (
    StudentListSerializer,
    StudentDetailSerializer,
    StudentCreateSerializer,
    StudentUpdateSerializer,
    StudentDeactivateSerializer,
    ImportSessionSerializer,
    ImportCommitSerializer
)
from apps.students.csv_parser import parse_and_validate_roster_csv


class StandardStudentPagination(PageNumberPagination):
    page_size = 15
    page_size_query_param = 'page_size'
    max_page_size = 100


class StudentListCreateView(APIView):
    """
    GET /api/v1/admin/students/
    List students with search, filters, and pagination.
    POST /api/v1/admin/students/
    Create a new student registry entry.
    """
    permission_classes = [IsElectionAdmin]

    def get(self, request, *args, **kwargs):
        queryset = Student.objects.all().select_related('institution', 'user')

        # Institution scoping: Non-superadmin election administrators see their institution's roster
        if request.user.role == Role.ELECTION_ADMIN and not getattr(request.user, 'is_superuser', False):
            if getattr(request.user, 'institution_id', None):
                inst = request.user.institution
                queryset = queryset.filter(
                    Q(institution_id=request.user.institution_id) |
                    Q(college_name__iexact=inst.name) |
                    Q(college_name__iexact=inst.code)
                )

        # Search by college_id or full_name
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(college_id__icontains=search) | Q(full_name__icontains=search) | Q(email__icontains=search)
            )

        # Filter by department
        department = request.query_params.get('department', '').strip()
        if department:
            queryset = queryset.filter(department__iexact=department)

        # Filter by academic year
        academic_year = request.query_params.get('academic_year', '').strip()
        if academic_year and academic_year.isdigit():
            queryset = queryset.filter(academic_year=int(academic_year))

        # Filter by enrollment status
        enrollment_status = request.query_params.get('enrollment_status', '').strip()
        if enrollment_status:
            queryset = queryset.filter(enrollment_status__iexact=enrollment_status)

        # Filter by active status
        is_active_param = request.query_params.get('is_active', '').strip().lower()
        if is_active_param in ('true', '1'):
            queryset = queryset.filter(is_active=True)
        elif is_active_param in ('false', '0'):
            queryset = queryset.filter(is_active=False)

        paginator = StandardStudentPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = StudentListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request, *args, **kwargs):
        serializer = StudentCreateSerializer(data=request.data)
        if serializer.is_valid():
            save_kwargs = {}
            if getattr(request.user, 'institution_id', None):
                save_kwargs['institution'] = request.user.institution
                if not serializer.validated_data.get('college_name') or serializer.validated_data.get('college_name') == 'CampusVote Collegiate Institute':
                    save_kwargs['college_name'] = request.user.institution.name
            student = serializer.save(**save_kwargs)

            # Record audit event
            log_audit_event(
                action=AuditAction.STUDENT_CREATED,
                target_type='STUDENT',
                actor=request.user,
                target_id=student.id,
                metadata={
                    'college_id': student.college_id,
                    'full_name': student.full_name,
                    'department': student.department,
                    'academic_year': student.academic_year,
                },
                request=request
            )

            return Response(
                StudentDetailSerializer(student).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class StudentDetailView(APIView):
    """
    GET /api/v1/admin/students/{id}/
    Inspect student record details.
    PATCH /api/v1/admin/students/{id}/
    Update student attributes.
    """
    permission_classes = [IsElectionAdmin]

    def get(self, request, pk, *args, **kwargs):
        student = get_object_or_404(Student, pk=pk)
        if request.user.role == Role.ELECTION_ADMIN and not getattr(request.user, 'is_superuser', False):
            if getattr(request.user, 'institution_id', None) and student.institution_id and student.institution_id != request.user.institution_id:
                return Response(
                    {"error": "Access denied. You do not have permission to view students from another college."},
                    status=status.HTTP_403_FORBIDDEN
                )
        return Response(StudentDetailSerializer(student).data, status=status.HTTP_200_OK)

    def patch(self, request, pk, *args, **kwargs):
        student = get_object_or_404(Student, pk=pk)
        if request.user.role == Role.ELECTION_ADMIN and not getattr(request.user, 'is_superuser', False):
            if getattr(request.user, 'institution_id', None) and student.institution_id and student.institution_id != request.user.institution_id:
                return Response(
                    {"error": "Access denied. You do not have permission to modify students from another college."},
                    status=status.HTTP_403_FORBIDDEN
                )
        serializer = StudentUpdateSerializer(student, data=request.data, partial=True)
        if serializer.is_valid():
            old_data = {
                'department': student.department,
                'academic_year': student.academic_year,
                'enrollment_status': student.enrollment_status,
                'is_active': student.is_active,
            }
            updated_student = serializer.save()

            log_audit_event(
                action=AuditAction.STUDENT_UPDATED,
                target_type='STUDENT',
                actor=request.user,
                target_id=updated_student.id,
                metadata={
                    'college_id': updated_student.college_id,
                    'changed_fields': list(request.data.keys()),
                    'prior': old_data,
                },
                request=request
            )

            return Response(StudentDetailSerializer(updated_student).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class StudentDeactivateView(APIView):
    """
    POST /api/v1/admin/students/{id}/deactivate/
    Administratively deactivates student voter record.
    """
    permission_classes = [IsElectionAdmin]

    def post(self, request, pk, *args, **kwargs):
        student = get_object_or_404(Student, pk=pk)
        if request.user.role == Role.ELECTION_ADMIN and not getattr(request.user, 'is_superuser', False):
            if getattr(request.user, 'institution_id', None) and student.institution_id and student.institution_id != request.user.institution_id:
                return Response(
                    {"error": "Access denied. You cannot deactivate students from another college."},
                    status=status.HTTP_403_FORBIDDEN
                )
        serializer = StudentDeactivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', 'Administrative deactivation')

        student.deactivate(reason=reason)

        log_audit_event(
            action=AuditAction.STUDENT_DEACTIVATED,
            target_type='STUDENT',
            actor=request.user,
            target_id=student.id,
            metadata={
                'college_id': student.college_id,
                'reason': reason
            },
            request=request
        )

        return Response({
            "message": f"Student {student.college_id} has been deactivated.",
            "student": StudentDetailSerializer(student).data
        }, status=status.HTTP_200_OK)


class StudentApproveView(APIView):
    """
    POST /api/v1/admin/students/{id}/approve/
    Administratively approves and verifies a student's enrollment standing.
    Sets enrollment_status to ENROLLED, activates the record, and activates the linked user account.
    """
    permission_classes = [IsElectionAdmin]

    def post(self, request, pk, *args, **kwargs):
        student = get_object_or_404(Student, pk=pk)
        if request.user.role == Role.ELECTION_ADMIN and not getattr(request.user, 'is_superuser', False):
            if getattr(request.user, 'institution_id', None) and student.institution_id and student.institution_id != request.user.institution_id:
                return Response(
                    {"error": "Access denied. You cannot approve students from another college."},
                    status=status.HTTP_403_FORBIDDEN
                )

        from apps.students.models import EnrollmentStatus
        from apps.accounts.models import AccountStatus
        from apps.verification.models import VerificationSession, VerificationState, DeliveryMethod

        student.enrollment_status = EnrollmentStatus.ENROLLED
        student.is_active = True
        update_fields = ['enrollment_status', 'is_active', 'updated_at']

        # Ensure student is linked to the approving admin's institution
        if getattr(request.user, 'institution_id', None) and not student.institution_id:
            student.institution = request.user.institution
            update_fields.append('institution')

        student.save(update_fields=update_fields)

        if student.user:
            user_update_fields = ['status', 'is_active']
            student.user.status = AccountStatus.ACTIVE
            student.user.is_active = True
            if getattr(request.user, 'institution_id', None) and not student.user.institution_id:
                student.user.institution = request.user.institution
                user_update_fields.append('institution')
            student.user.save(update_fields=user_update_fields)

        # Mark VerificationSession as VERIFIED to ensure immediate voting capability
        VerificationSession.objects.update_or_create(
            college_id=student.college_id,
            defaults={
                'state': VerificationState.VERIFIED,
                'email': student.email or (student.user.email if student.user else ''),
                'delivery_method': DeliveryMethod.EMAIL,
            }
        )

        log_audit_event(
            action=AuditAction.STUDENT_UPDATED,
            target_type='STUDENT',
            actor=request.user,
            target_id=student.id,
            metadata={
                'college_id': student.college_id,
                'action': 'MANUAL_ENROLLMENT_VERIFIED',
                'new_status': EnrollmentStatus.ENROLLED,
                'verified_by': request.user.username,
            },
            request=request
        )

        return Response({
            "message": f"Student {student.full_name} ({student.college_id}) has been approved and verified.",
            "student": StudentDetailSerializer(student).data
        }, status=status.HTTP_200_OK)


class StudentSummaryView(APIView):
    """
    GET /api/v1/admin/students/summary/
    Returns live database counts for dashboards.
    """
    permission_classes = [IsElectionAdmin]

    def get(self, request, *args, **kwargs):
        queryset = Student.objects.all()
        if request.user.role == Role.ELECTION_ADMIN and not getattr(request.user, 'is_superuser', False):
            if getattr(request.user, 'institution_id', None):
                inst = request.user.institution
                queryset = queryset.filter(
                    Q(institution_id=request.user.institution_id) |
                    Q(college_name__iexact=inst.name) |
                    Q(college_name__iexact=inst.code)
                )

        total_students = queryset.count()
        active_students = queryset.filter(is_active=True).count()
        inactive_students = total_students - active_students
        from apps.students.models import EnrollmentStatus
        pending_students = queryset.filter(enrollment_status=EnrollmentStatus.PENDING).count()

        # Breakdown by department
        depts = (
            queryset.values('department')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        by_department = {d['department']: d['count'] for d in depts}

        # Breakdown by academic year
        years = (
            queryset.values('academic_year')
            .annotate(count=Count('id'))
            .order_by('academic_year')
        )
        by_academic_year = {str(y['academic_year']): y['count'] for y in years}

        # Breakdown by enrollment status
        statuses = (
            queryset.values('enrollment_status')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        by_enrollment_status = {s['enrollment_status']: s['count'] for s in statuses}

        return Response({
            'total_students': total_students,
            'active_students': active_students,
            'inactive_students': inactive_students,
            'pending_students': pending_students,
            'by_department': by_department,
            'by_academic_year': by_academic_year,
            'by_enrollment_status': by_enrollment_status,
            'supported_departments': INSTITUTIONAL_DEPARTMENTS,
        }, status=status.HTTP_200_OK)


from rest_framework.parsers import MultiPartParser, FormParser

class RosterImportPreviewView(APIView):
    """
    POST /api/v1/admin/students/import/preview/
    Uploads and parses CSV file, detects conflicts, and stores preview session.
    Does NOT modify the student database.
    """
    permission_classes = [IsElectionAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response(
                {"error": "No file was uploaded. Please attach a CSV file with field name 'file'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not uploaded_file.name.lower().endswith('.csv'):
            return Response(
                {"error": "Invalid file format. Only .csv files are supported."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            summary, rows_data = parse_and_validate_roster_csv(uploaded_file)
        except Exception as exc:
            log_audit_event(
                action=AuditAction.ROSTER_IMPORT_FAILED,
                target_type='ROSTER_IMPORT',
                actor=request.user,
                metadata={'filename': uploaded_file.name, 'error': str(exc)},
                request=request
            )
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Create persistent session bound to the administrator's institution
        session = ImportSession.objects.create(
            created_by=request.user,
            institution=getattr(request.user, 'institution', None),
            filename=uploaded_file.name,
            file_size_bytes=uploaded_file.size,
            status=ImportSessionStatus.PENDING,
            total_rows=summary['total_rows'],
            valid_rows=summary['valid_rows'],
            invalid_rows=summary['invalid_rows'],
            duplicate_rows=summary['duplicate_rows'],
            conflict_rows=summary['conflict_rows'],
            identical_rows=summary['identical_rows'],
            preview_data=rows_data
        )

        log_audit_event(
            action=AuditAction.ROSTER_PREVIEWED,
            target_type='ROSTER_IMPORT',
            actor=request.user,
            target_id=session.id,
            metadata={
                'filename': session.filename,
                'total_rows': session.total_rows,
                'valid_rows': session.valid_rows,
                'invalid_rows': session.invalid_rows,
            },
            request=request
        )

        return Response(ImportSessionSerializer(session).data, status=status.HTTP_200_OK)


class RosterImportCommitView(APIView):
    """
    POST /api/v1/admin/students/import/commit/
    Atomically commits previewed valid/non-conflicting rows to the student database.
    """
    permission_classes = [IsElectionAdmin]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        serializer = ImportCommitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session_id = serializer.validated_data['session_id']
        strategy = serializer.validated_data['strategy']

        session = get_object_or_404(ImportSession, pk=session_id)

        if request.user.role == Role.ELECTION_ADMIN and not getattr(request.user, 'is_superuser', False):
            if getattr(request.user, 'institution_id', None) and session.institution_id and session.institution_id != request.user.institution_id:
                return Response(
                    {"error": "Access denied. You do not have permission to commit roster imports for another institution."},
                    status=status.HTTP_403_FORBIDDEN
                )

        if session.status != ImportSessionStatus.PENDING:
            return Response(
                {"error": f"Import session is in '{session.get_status_display()}' state and cannot be committed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        created_count = 0
        updated_count = 0
        skipped_count = 0

        target_inst = session.institution or getattr(request.user, 'institution', None)
        inst_name = target_inst.name if target_inst else 'CampusVote Collegiate Institute'

        for row in session.preview_data:
            row_status = row.get('status')
            college_id = row.get('college_id')

            if row_status == 'VALID':
                Student.objects.create(
                    college_id=college_id,
                    full_name=row.get('full_name'),
                    email=row.get('email'),
                    department=row.get('department'),
                    academic_year=row.get('academic_year'),
                    course=row.get('course', ''),
                    college_name=inst_name,
                    institution=target_inst,
                    is_active=True
                )
                created_count += 1

            elif row_status == 'CONFLICT':
                if strategy == 'update_conflicts':
                    student = Student.objects.filter(college_id=college_id).first()
                    if student:
                        student.full_name = row.get('full_name', student.full_name)
                        student.email = row.get('email', student.email)
                        student.department = row.get('department', student.department)
                        student.academic_year = row.get('academic_year', student.academic_year)
                        student.course = row.get('course', student.course)
                        student.save()
                        updated_count += 1
                else:
                    skipped_count += 1

            elif row_status in ('IDENTICAL', 'DUPLICATE', 'INVALID'):
                skipped_count += 1

        session.status = ImportSessionStatus.COMMITTED
        session.committed_at = timezone.now()
        session.save(update_fields=['status', 'committed_at'])

        log_audit_event(
            action=AuditAction.ROSTER_IMPORTED,
            target_type='ROSTER_IMPORT',
            actor=request.user,
            target_id=session.id,
            metadata={
                'filename': session.filename,
                'created_count': created_count,
                'updated_count': updated_count,
                'skipped_count': skipped_count,
                'strategy': strategy,
            },
            request=request
        )

        return Response({
            "message": "Student roster batch committed successfully.",
            "session_id": session.id,
            "created_count": created_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "total_processed": created_count + updated_count + skipped_count
        }, status=status.HTTP_200_OK)


class RosterTemplateDownloadView(APIView):
    """
    GET /api/v1/admin/students/import/template/
    Returns a downloadable CSV template with standard columns.
    """
    permission_classes = [IsElectionAdmin]

    def get(self, request, *args, **kwargs):
        content = (
            "college_id,full_name,email,department,academic_year,course\r\n"
            "STU-2026-101,Maya Lin,maya.lin@campusvote.edu,Computer Science,2,B.Tech Computer Science\r\n"
            "STU-2026-102,David Kumar,david.kumar@campusvote.edu,Electrical Engineering,3,B.Tech Electrical\r\n"
        )
        response = HttpResponse(content, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="campusvote_roster_template.csv"'
        return response


class StudentRegistrationView(APIView):
    """
    POST /api/v1/students/register/ and /api/v1/auth/register/
    Public student self-registration endpoint.
    Matches against official pre-approved institutional roster when available,
    or creates pending student record for administrative review.
    """
    permission_classes = []
    throttle_scope = 'register'

    def post(self, request, *args, **kwargs):
        import secrets
        from apps.accounts.models import User, Role, AccountStatus
        from apps.students.serializers import StudentRegistrationSerializer

        serializer = StudentRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Registration validation failed", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        full_name = serializer.validated_data['full_name'].strip()
        college_name = serializer.validated_data['college_name'].strip()
        college_id = serializer.validated_data['college_id'].strip().upper()
        email = serializer.validated_data['email'].strip().lower()
        department = serializer.validated_data['department'].strip()
        academic_year = serializer.validated_data['academic_year']
        password = serializer.validated_data['password']

        # 1. Prevent duplicate account registration
        if User.objects.filter(college_id__iexact=college_id).exists():
            return Response(
                {
                    "error": "Account already exists",
                    "message": f"An account is already registered with College ID '{college_id}'. Please sign in."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {
                    "error": "Account already exists",
                    "message": f"An account is already registered with email '{email}'. Please sign in."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Resolve institution
        from apps.accounts.models import Institution, InstitutionStatus, User, Role
        import re
        clean_college = college_name.strip()
        clean_normalized = re.sub(r'[^a-z0-9]', '', clean_college.lower())
        email_domain = email.split('@')[1].strip().lower() if '@' in email else ''

        # Match 1: Exact case-insensitive name
        institution = Institution.objects.filter(name__iexact=clean_college).first()
        # Match 2: Exact code match (e.g. GMRIT)
        if not institution and clean_college:
            institution = Institution.objects.filter(code__iexact=clean_college).first()
        # Match 3: Normalized name match
        if not institution and clean_normalized:
            institution = Institution.objects.filter(normalized_name=clean_normalized).first()
        # Match 4: Substring name match
        if not institution and len(clean_college) >= 3:
            institution = Institution.objects.filter(name__icontains=clean_college).first()
        # Match 5: By college admin institution whose name or code matches
        if not institution and clean_college:
            admin_user = User.objects.filter(
                role=Role.ELECTION_ADMIN,
                institution__isnull=False
            ).filter(
                Q(institution__name__icontains=clean_college) | Q(institution__code__icontains=clean_college)
            ).first()
            if admin_user and admin_user.institution:
                institution = admin_user.institution
        # Match 6: By institutional email domain
        if not institution and email_domain and email_domain not in ('gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'):
            institution = Institution.objects.filter(email_domain__iexact=email_domain).first()

        # Fallback: create institution if completely new
        if not institution:
            institution = Institution.objects.create(
                code=f"COL-{secrets.token_hex(3).upper()}",
                name=clean_college,
                normalized_name=clean_normalized,
                email_domain=email_domain if email_domain not in ('gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com') else '',
                status=InstitutionStatus.PENDING_VERIFICATION,
                is_demo=True,
            )

        # 3. Check official institutional roster
        roster_student = Student.objects.filter(college_id__iexact=college_id).first()
        if not roster_student:
            roster_student = Student.objects.filter(email__iexact=email).first()

        # CASE A: Student exists in approved institutional roster
        if roster_student:
            if roster_student.user is not None:
                return Response(
                    {
                        "error": "Account already linked",
                        "message": "An account is already active for this student record. Please sign in."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not roster_student.is_active:
                return Response(
                    {
                        "error": "Deactivated student record",
                        "message": "This student record is administratively deactivated. Please contact the registrar."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            with transaction.atomic():
                inst_to_assign = roster_student.institution or institution
                user = User.objects.create_user(
                    username=roster_student.college_id,
                    email=roster_student.email or email,
                    password=password,
                    first_name=full_name.split()[0] if full_name else '',
                    last_name=' '.join(full_name.split()[1:]) if full_name and len(full_name.split()) > 1 else '',
                    college_id=roster_student.college_id,
                    role=Role.STUDENT,
                    status=AccountStatus.ACTIVE,
                    institution=inst_to_assign,
                )
                roster_student.user = user
                roster_student.institution = inst_to_assign
                if college_name and (not roster_student.college_name or roster_student.college_name == 'CampusVote Collegiate Institute'):
                    roster_student.college_name = college_name
                    roster_student.save(update_fields=['user', 'college_name', 'institution'])
                else:
                    roster_student.save(update_fields=['user', 'institution'])

                log_audit_event(
                    action=AuditAction.STUDENT_REGISTERED,
                    target_type='STUDENT',
                    target_id=roster_student.college_id,
                    metadata={
                        'verified_against_roster': True,
                        'enrollment_status': roster_student.enrollment_status,
                        'college_name': roster_student.college_name,
                        'institution_id': str(inst_to_assign.id) if inst_to_assign else None,
                    },
                    request=request
                )

            return Response({
                "message": "Student registration completed. Your institutional identity was verified against the campus roster. You may now sign in.",
                "status": "VERIFIED",
                "is_verified": True,
                "college_id": roster_student.college_id,
                "college_name": roster_student.college_name,
                "full_name": roster_student.full_name,
            }, status=status.HTTP_201_CREATED)

        # CASE B: Student does not yet exist in roster (create pending record)
        with transaction.atomic():
            user = User.objects.create_user(
                username=college_id,
                email=email,
                password=password,
                first_name=full_name.split()[0] if full_name else '',
                last_name=' '.join(full_name.split()[1:]) if full_name and len(full_name.split()) > 1 else '',
                college_id=college_id,
                role=Role.STUDENT,
                status=AccountStatus.ACTIVE,
                institution=institution,
            )
            from apps.students.models import EnrollmentStatus
            new_student = Student.objects.create(
                college_id=college_id,
                college_name=college_name,
                institution=institution,
                full_name=full_name,
                email=email,
                department=department,
                academic_year=academic_year,
                course=f"B.Tech {department}",
                enrollment_status=EnrollmentStatus.PENDING,
                is_active=True,
                user=user
            )

            log_audit_event(
                action=AuditAction.STUDENT_REGISTERED,
                target_type='STUDENT',
                target_id=new_student.college_id,
                metadata={
                    'verified_against_roster': False,
                    'status': 'PENDING_INSTITUTIONAL_VERIFICATION',
                    'college_name': new_student.college_name,
                    'institution_id': str(institution.id) if institution else None,
                },
                request=request
            )

        return Response({
            "message": "Registration received. Your student record is pending institutional verification by the registrar. An administrator must approve your enrollment before you can cast ballots.",
            "status": "PENDING_VERIFICATION",
            "is_verified": False,
            "college_id": new_student.college_id,
            "college_name": new_student.college_name,
            "full_name": new_student.full_name,
        }, status=status.HTTP_201_CREATED)


class VoterIdCardGenerateView(APIView):
    """
    POST /api/v1/students/voter-id/generate/
    Generates a cryptographically unique Smart Voter ID credential.
    Requires active enrollment and authenticated student session.
    """
    from apps.accounts.permissions import IsStudent
    from rest_framework.permissions import IsAuthenticated
    permission_classes = [IsAuthenticated, IsStudent]
    throttle_scope = 'voter_id_generate'

    def post(self, request, *args, **kwargs):
        import secrets
        from apps.students.models import VoterIdCard, EnrollmentStatus
        from apps.students.serializers import VoterIdCardSerializer
        from apps.verification.qr_service import generate_signed_qr_payload

        student = getattr(request.user, 'student_record', None)
        if not student:
            return Response(
                {"error": "No student registry record linked to current user session."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not student.is_active:
            return Response(
                {"error": "Student record is administratively deactivated."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Self-service voter credential issuance is enabled for active registered student accounts.
        # Manual registrar approval is not required to issue a digital ID card,
        # but the card clearly reflects whether institutional enrollment has been verified.

        # Idempotent retrieval if already generated
        card = VoterIdCard.objects.filter(student=student).first()
        if not card:
            # Generate cryptographically secure unique reference
            voter_id_number = f"CV-2026-{secrets.token_hex(4).upper()}"
            while VoterIdCard.objects.filter(voter_id_number=voter_id_number).exists():
                voter_id_number = f"CV-2026-{secrets.token_hex(4).upper()}"

            qr_payload = generate_signed_qr_payload(student.college_id)

            card = VoterIdCard.objects.create(
                student=student,
                voter_id_number=voter_id_number,
                qr_payload=qr_payload,
                is_active=True
            )

            log_audit_event(
                action=AuditAction.VOTER_ID_GENERATED,
                target_type='STUDENT',
                target_id=student.college_id,
                metadata={
                    'voter_id_number': voter_id_number,
                },
                request=request
            )

        serializer = VoterIdCardSerializer(card)
        return Response({
            "message": "Smart Voter ID credential generated successfully.",
            "voter_id": serializer.data
        }, status=status.HTTP_200_OK)


class VoterIdCardMeView(APIView):
    """
    GET /api/v1/students/voter-id/me/
    Retrieves current authenticated student's voter credential.
    """
    from apps.accounts.permissions import IsStudent
    from rest_framework.permissions import IsAuthenticated
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request, *args, **kwargs):
        from apps.students.models import VoterIdCard, EnrollmentStatus
        from apps.students.serializers import VoterIdCardSerializer

        student = getattr(request.user, 'student_record', None)
        if not student:
            return Response(
                {"error": "No student profile found for current user session."},
                status=status.HTTP_403_FORBIDDEN
            )

        card = VoterIdCard.objects.filter(student=student).first()
        if not card:
            is_eligible = bool(student.is_active)
            return Response({
                "has_voter_id": False,
                "eligible_to_generate": is_eligible,
                "enrollment_status": student.enrollment_status,
                "enrollment_status_display": student.get_enrollment_status_display(),
                "message": "No voter ID card generated yet." if is_eligible else "Student account is deactivated. Not eligible to generate."
            }, status=status.HTTP_200_OK)

        serializer = VoterIdCardSerializer(card)
        return Response({
            "has_voter_id": True,
            "voter_id": serializer.data
        }, status=status.HTTP_200_OK)

