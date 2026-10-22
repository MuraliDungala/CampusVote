"""
Serializers for Student Roster Management.
CampusVote Student Architecture.
"""

from rest_framework import serializers
from django.utils.translation import gettext_lazy as _
from apps.students.models import Student, ImportSession, EnrollmentStatus, INSTITUTIONAL_DEPARTMENTS


class StudentListSerializer(serializers.ModelSerializer):
    """Clean representation for student roster tables and search listings."""
    enrollment_status_display = serializers.CharField(source='get_enrollment_status_display', read_only=True)
    institution_id = serializers.UUIDField(source='institution.id', read_only=True, allow_null=True)
    institution_name = serializers.CharField(source='institution.name', read_only=True, allow_null=True)

    class Meta:
        model = Student
        fields = [
            'id',
            'college_id',
            'college_name',
            'institution_id',
            'institution_name',
            'full_name',
            'email',
            'department',
            'academic_year',
            'course',
            'enrollment_status',
            'enrollment_status_display',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class StudentDetailSerializer(StudentListSerializer):
    """Detailed student view with linked user account information."""
    has_user_account = serializers.SerializerMethodField()
    user_username = serializers.SerializerMethodField()

    class Meta(StudentListSerializer.Meta):
        fields = StudentListSerializer.Meta.fields + ['has_user_account', 'user_username']

    def get_has_user_account(self, obj) -> bool:
        return obj.user is not None

    def get_user_username(self, obj) -> str:
        return obj.user.username if obj.user else ''


class StudentCreateSerializer(serializers.ModelSerializer):
    """Validates creation of new student records."""

    class Meta:
        model = Student
        fields = [
            'college_id',
            'college_name',
            'full_name',
            'email',
            'department',
            'academic_year',
            'course',
            'enrollment_status',
            'is_active',
        ]

    def validate_college_id(self, value):
        normalized = value.strip().upper()
        if Student.objects.filter(college_id=normalized).exists():
            raise serializers.ValidationError(_("A student with this College ID already exists."))
        return normalized

    def validate_email(self, value):
        normalized = value.strip().lower()
        if Student.objects.filter(email=normalized).exists():
            raise serializers.ValidationError(_("A student with this email address already exists."))
        return normalized

    def validate_academic_year(self, value):
        if not (1 <= value <= 5):
            raise serializers.ValidationError(_("Academic year must be between 1 and 5."))
        return value


class StudentUpdateSerializer(serializers.ModelSerializer):
    """Handles controlled updates to existing student registry records."""

    class Meta:
        model = Student
        fields = [
            'college_name',
            'full_name',
            'email',
            'department',
            'academic_year',
            'course',
            'enrollment_status',
            'is_active',
        ]

    def validate_email(self, value):
        normalized = value.strip().lower()
        query = Student.objects.filter(email=normalized)
        if self.instance:
            query = query.exclude(id=self.instance.id)
        if query.exists():
            raise serializers.ValidationError(_("Another student already has this email address."))
        return normalized

    def validate_academic_year(self, value):
        if not (1 <= value <= 5):
            raise serializers.ValidationError(_("Academic year must be between 1 and 5."))
        return value


class StudentDeactivateSerializer(serializers.Serializer):
    """Validates reason for administrative deactivation."""
    reason = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default='Administrative deactivation'
    )


class ImportSessionSerializer(serializers.ModelSerializer):
    """Full detail of an import session including preview rows."""
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = ImportSession
        fields = [
            'id',
            'filename',
            'file_size_bytes',
            'status',
            'total_rows',
            'valid_rows',
            'invalid_rows',
            'duplicate_rows',
            'conflict_rows',
            'identical_rows',
            'preview_data',
            'error_summary',
            'created_by_username',
            'created_at',
            'committed_at',
        ]
        read_only_fields = fields


class ImportCommitSerializer(serializers.Serializer):
    """Validates commitment of an existing previewed import session."""
    session_id = serializers.UUIDField(required=True)
    strategy = serializers.ChoiceField(
        choices=['create_only', 'skip_conflicts', 'update_conflicts'],
        default='skip_conflicts',
        help_text=_("Conflict resolution strategy for pre-existing database records.")
    )


class StudentRegistrationSerializer(serializers.Serializer):
    """
    Validates self-registration data submitted by students.
    Enforces required field validation, normalization, duplicate checks,
    and institutional credential guidelines.
    """
    full_name = serializers.CharField(
        max_length=255,
        required=True,
        trim_whitespace=True,
        error_messages={'required': _("Full name is required.")}
    )
    college_name = serializers.CharField(
        max_length=255,
        required=True,
        trim_whitespace=True,
        error_messages={'required': _("College name is required.")}
    )
    college_id = serializers.CharField(
        max_length=64,
        required=True,
        trim_whitespace=True,
        error_messages={'required': _("College ID / Roll Number is required.")}
    )
    email = serializers.EmailField(
        max_length=255,
        required=True,
        trim_whitespace=True,
        error_messages={'required': _("Institutional email address is required.")}
    )
    department = serializers.CharField(
        max_length=100,
        required=True,
        trim_whitespace=True,
        error_messages={'required': _("Department is required.")}
    )
    custom_department = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        trim_whitespace=True
    )
    academic_year = serializers.IntegerField(
        required=True,
        min_value=1,
        max_value=5,
        error_messages={
            'required': _("Academic year is required."),
            'min_value': _("Academic year must be between 1 and 5."),
            'max_value': _("Academic year must be between 1 and 5.")
        }
    )
    password = serializers.CharField(
        min_length=8,
        required=True,
        write_only=True,
        style={'input_type': 'password'},
        error_messages={
            'required': _("Password is required."),
            'min_length': _("Password must be at least 8 characters.")
        }
    )

    def validate_college_name(self, value):
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError(_("College name cannot be blank."))
        return normalized

    def validate_college_id(self, value):
        normalized = value.strip().upper()
        if not normalized:
            raise serializers.ValidationError(_("College ID cannot be blank."))
        return normalized

    def validate_email(self, value):
        normalized = value.strip().lower()
        if not normalized or '@' not in normalized:
            raise serializers.ValidationError(_("Valid institutional email address is required."))
        return normalized

    def validate(self, attrs):
        dept = attrs.get('department', '').strip()
        custom_dept = attrs.get('custom_department', '').strip()

        if dept.lower() == 'other':
            if not custom_dept:
                raise serializers.ValidationError({
                    'custom_department': _("Please enter your department name.")
                })
            attrs['department'] = custom_dept
        elif not dept:
            raise serializers.ValidationError({
                'department': _("Department is required.")
            })
        else:
            attrs['department'] = dept

        return attrs


class VoterIdCardSerializer(serializers.ModelSerializer):
    """
    Representation of issued Smart Voter ID credential.
    Exposes verified student metadata, unique cryptographic ID, and opaque QR token.
    """
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    college_id = serializers.CharField(source='student.college_id', read_only=True)
    college_name = serializers.CharField(source='student.college_name', read_only=True)
    department = serializers.CharField(source='student.department', read_only=True)
    academic_year = serializers.IntegerField(source='student.academic_year', read_only=True)
    enrollment_status = serializers.CharField(source='student.enrollment_status', read_only=True)
    enrollment_status_display = serializers.CharField(source='student.get_enrollment_status_display', read_only=True)

    class Meta:
        from apps.students.models import VoterIdCard
        model = VoterIdCard
        fields = [
            'id',
            'voter_id_number',
            'qr_payload',
            'student_name',
            'college_id',
            'college_name',
            'department',
            'academic_year',
            'enrollment_status',
            'enrollment_status_display',
            'issued_at',
            'is_active',
        ]
        read_only_fields = fields

