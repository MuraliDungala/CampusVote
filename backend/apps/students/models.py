"""
Student Roster Registry Models.
Smart ID-Based College Voting System (CampusVote).
Separates official academic registry data from ballot records and voting choices.
"""

import uuid
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

INSTITUTIONAL_DEPARTMENTS = [
    'Computer Science and Engineering',
    'Artificial Intelligence and Machine Learning',
    'Data Science',
    'Electronics and Communication Engineering',
    'Electrical and Electronics Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Information Technology',
    # Preserved compatibility departments:
    'Computer Science',
    'Electrical Engineering',
    'Business Administration',
    'Mathematics',
    'Biotechnology',
    'Physics',
    'Chemistry',
]


class EnrollmentStatus(models.TextChoices):
    ENROLLED = 'ENROLLED', _('Enrolled / Active')
    PENDING = 'PENDING', _('Pending Institutional Verification')
    ON_LEAVE = 'ON_LEAVE', _('On Academic Leave')
    SUSPENDED = 'SUSPENDED', _('Suspended')
    GRADUATED = 'GRADUATED', _('Graduated')
    WITHDRAWN = 'WITHDRAWN', _('Withdrawn')


class ImportSessionStatus(models.TextChoices):
    PENDING = 'PENDING', _('Pending Review')
    COMMITTED = 'COMMITTED', _('Committed to Database')
    CANCELLED = 'CANCELLED', _('Cancelled by Administrator')
    FAILED = 'FAILED', _('Import Failed')


class Student(models.Model):
    """
    Official institutional student registry record.
    Acts as the source of truth for student identity, department, and academic standing.
    Maintains zero linkage to any anonymous ballot or vote choices.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Unique identifier for student record.")
    )

    college_id = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text=_("Normalized institutional student identification number.")
    )

    college_name = models.CharField(
        max_length=255,
        default='CampusVote Collegiate Institute',
        db_index=True,
        help_text=_("Student college or institution name.")
    )

    full_name = models.CharField(
        max_length=255,
        db_index=True,
        help_text=_("Student legal or registered full name.")
    )

    email = models.EmailField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text=_("Institution-issued student email address.")
    )

    department = models.CharField(
        max_length=100,
        db_index=True,
        help_text=_("Academic department or faculty.")
    )

    academic_year = models.PositiveSmallIntegerField(
        db_index=True,
        validators=[
            MinValueValidator(1, message="Academic year must be at least 1."),
            MaxValueValidator(5, message="Academic year cannot exceed 5.")
        ],
        help_text=_("Current academic year of study (1 through 5).")
    )

    course = models.CharField(
        max_length=150,
        blank=True,
        default='Undergraduate Degree Program',
        help_text=_("Degree program or major (e.g., B.Tech Computer Science).")
    )

    enrollment_status = models.CharField(
        max_length=32,
        choices=EnrollmentStatus.choices,
        default=EnrollmentStatus.ENROLLED,
        db_index=True,
        help_text=_("Academic standing with the registrar.")
    )

    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text=_("Administrative active flag. Deactivated students are disqualified from elections.")
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    institution = models.ForeignKey(
        'accounts.Institution',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='students',
        help_text=_("Institutional university or college.")
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_record',
        help_text=_("Linked authentication user account if one has been provisioned.")
    )

    class Meta:
        db_table = 'campusvote_students'
        ordering = ['department', 'academic_year', 'college_id']
        verbose_name = _('Student')

    def clean(self):
        super().clean()
        if self.college_id:
            self.college_id = self.college_id.strip().upper()
        if not self.college_id:
            raise ValidationError({'college_id': _("College ID is required.")})

        if not self.full_name or not self.full_name.strip():
            raise ValidationError({'full_name': _("Student full name is required.")})
        self.full_name = self.full_name.strip()

        if self.email:
            self.email = self.email.strip().lower()
        else:
            raise ValidationError({'email': _("Email address is required.")})

        if self.college_name:
            self.college_name = self.college_name.strip()
        else:
            self.college_name = 'CampusVote Collegiate Institute'

        if self.department:
            self.department = self.department.strip()
        else:
            raise ValidationError({'department': _("Department is required.")})

        if self.academic_year is not None:
            if not (1 <= self.academic_year <= 5):
                raise ValidationError({
                    'academic_year': _("Academic year must be between 1 and 5.")
                })
        else:
            raise ValidationError({'academic_year': _("Academic year is required.")})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def deactivate(self, reason: str = ''):
        """Administratively deactivates the student while preserving historical records."""
        self.is_active = False
        self.save(update_fields=['is_active', 'updated_at'])

        # If a linked user exists, synchronize active status
        if self.user:
            self.user.is_active = False
            self.user.save(update_fields=['is_active'])

    def __str__(self):
        return f"{self.college_id} - {self.full_name} ({self.college_name}, {self.department}, Year {self.academic_year})"


class ImportSession(models.Model):
    """
    Server-side session for multi-step CSV roster upload, preview, and atomic commit.
    Enforces expiry and prevents client-side tampering with row validation results.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    filename = models.CharField(max_length=255)
    file_size_bytes = models.IntegerField(default=0)
    status = models.CharField(
        max_length=32,
        choices=ImportSessionStatus.choices,
        default=ImportSessionStatus.PENDING,
        db_index=True
    )
    total_rows = models.IntegerField(default=0)
    valid_rows = models.IntegerField(default=0)
    invalid_rows = models.IntegerField(default=0)
    duplicate_rows = models.IntegerField(default=0)
    conflict_rows = models.IntegerField(default=0)
    identical_rows = models.IntegerField(default=0)
    preview_data = models.JSONField(default=list)
    error_summary = models.TextField(blank=True)
    institution = models.ForeignKey(
        'accounts.Institution',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='import_sessions',
        help_text=_("Institution for which this student roster is being imported.")
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='import_sessions'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    committed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'campusvote_import_sessions'
        ordering = ['-created_at']

    def __str__(self):
        return f"ImportSession[{self.id}] - {self.filename} ({self.status})"


class VoterIdCard(models.Model):
    """
    Digital Smart Voter ID Credential for CampusVote.
    Issued only to institutionally verified, active enrolled students.
    Enforces uniqueness, non-repudiation, and audit compliance.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Unique identifier for voter ID credential.")
    )
    student = models.OneToOneField(
        'students.Student',
        on_delete=models.CASCADE,
        related_name='voter_card',
        help_text=_("Student holding this voter credential.")
    )
    voter_id_number = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text=_("Cryptographically generated unique voter ID reference (e.g. CV-2026-A1B2C3D4).")
    )
    qr_payload = models.CharField(
        max_length=255,
        help_text=_("Opaque signed verification token for scanner verification.")
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(
        default=True,
        help_text=_("Active validity status of this voter credential.")
    )

    class Meta:
        db_table = 'campusvote_voter_cards'
        verbose_name = _('Voter ID Card')
        verbose_name_plural = _('Voter ID Cards')

    def __str__(self):
        return f"Voter ID {self.voter_id_number} ({self.student.college_id})"

