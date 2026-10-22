"""
Custom User Model and Role-Based Access Control (RBAC) Architecture.
Smart ID-Based College Voting System (CampusVote).
"""

import uuid
from django.db import models
from django.contrib.auth.models import (
    AbstractBaseUser,
    PermissionsMixin,
    BaseUserManager,
    Group,
    Permission
)
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Role(models.TextChoices):
    STUDENT = 'STUDENT', _('Student')
    ELECTION_ADMIN = 'ELECTION_ADMIN', _('Election Administrator')
    AUDITOR = 'AUDITOR', _('System Auditor')
    SUPER_ADMIN = 'SUPER_ADMIN', _('Super Administrator')


class AccountStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', _('Active')
    SUSPENDED = 'SUSPENDED', _('Suspended')
    REVOKED = 'REVOKED', _('Revoked')


class InstitutionStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', _('Active')
    PENDING_VERIFICATION = 'PENDING_VERIFICATION', _('Pending Institutional Verification')
    SUSPENDED = 'SUSPENDED', _('Suspended')


class Institution(models.Model):
    """
    Official higher education institution entity.
    Maintains multi-tenant isolation across colleges, student rosters, and elections.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Unique identifier for the institution.")
    )
    code = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        help_text=_("Unique college identification code (e.g. CAMPUSVOTE-MAIN, GMRIT, IITB).")
    )
    name = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text=_("Official institution display name.")
    )
    normalized_name = models.CharField(
        max_length=255,
        db_index=True,
        help_text=_("Normalized lowercase alphanumeric name for search and matching.")
    )
    email_domain = models.CharField(
        max_length=128,
        blank=True,
        default='',
        db_index=True,
        help_text=_("Configured institutional email domain (optional / non-unique).")
    )
    status = models.CharField(
        max_length=32,
        choices=InstitutionStatus.choices,
        default=InstitutionStatus.ACTIVE,
        db_index=True,
        help_text=_("Institution verification and operational status.")
    )
    is_demo = models.BooleanField(
        default=False,
        help_text=_("Designates whether this institution is a demonstration or simulation entity.")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'campusvote_institutions'
        ordering = ['name']
        verbose_name = _('Institution')
        verbose_name_plural = _('Institutions')

    def __str__(self):
        return f"{self.name} ({self.code})"

    def clean(self):
        super().clean()
        import re
        if self.code:
            self.code = self.code.strip().upper()
        if self.name:
            self.name = self.name.strip()
            self.normalized_name = re.sub(r'[^a-z0-9]', '', self.name.lower())
        if self.email_domain:
            self.email_domain = self.email_domain.strip().lower()

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class CustomUserManager(BaseUserManager):
    """Custom manager for the UUID-based User model."""

    def create_user(self, username, email, password=None, role=Role.STUDENT, **extra_fields):
        if not username:
            raise ValueError(_("The Username field is required."))
        if not email:
            raise ValueError(_("The Email field is required."))

        email = self.normalize_email(email)
        username = username.strip()

        # Normalize college_id if present
        if 'college_id' in extra_fields and extra_fields['college_id']:
            extra_fields['college_id'] = extra_fields['college_id'].strip().upper()

        user = self.model(
            username=username,
            email=email,
            role=role,
            **extra_fields
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', Role.SUPER_ADMIN)
        extra_fields.setdefault('status', AccountStatus.ACTIVE)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError(_('Superuser must have is_staff=True.'))
        if extra_fields.get('is_superuser') is not True:
            raise ValueError(_('Superuser must have is_superuser=True.'))

        return self.create_user(username, email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Primary User entity for CampusVote.
    Uses UUID primary keys and decoupled role definitions.
    Strictly isolated from any ballot or voting choice tables.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text=_("Unique UUID identifier for account isolation.")
    )

    username = models.CharField(
        max_length=150,
        unique=True,
        db_index=True,
        help_text=_("Account login handle.")
    )

    email = models.EmailField(
        unique=True,
        db_index=True,
        help_text=_("Institutional email address.")
    )

    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)

    college_id = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text=_("Normalized institutional student or staff identification number.")
    )

    role = models.CharField(
        max_length=32,
        choices=Role.choices,
        default=Role.STUDENT,
        db_index=True,
        help_text=_("Application security role defining access scopes.")
    )

    status = models.CharField(
        max_length=20,
        choices=AccountStatus.choices,
        default=AccountStatus.ACTIVE,
        db_index=True,
        help_text=_("Account lifecycle status. Non-active accounts are denied all access.")
    )

    is_active = models.BooleanField(
        default=True,
        help_text=_("Designates whether this user should be treated as active.")
    )

    institution = models.ForeignKey(
        'accounts.Institution',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        help_text=_("Associated institution for college administrators or affiliated users.")
    )

    is_staff = models.BooleanField(
        default=False,
        help_text=_("Designates whether the user can log into the Django admin site.")
    )

    # Timestamps & Telemetry
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    objects = CustomUserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    class Meta:
        db_table = 'campusvote_users'
        verbose_name = _('User')
        verbose_name.plural = _('Users')
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.college_id:
            self.college_id = self.college_id.strip().upper()
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email)

    def save(self, *args, **kwargs):
        self.clean()
        # Keep is_active synchronized with account status
        if self.status != AccountStatus.ACTIVE:
            self.is_active = False
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        name = f"{self.first_name} {self.last_name}".strip()
        return name if name else self.username

    @property
    def display_identifier(self):
        return self.college_id or self.username

    @property
    def is_student(self):
        return self.role == Role.STUDENT

    @property
    def is_election_admin(self):
        return self.role in (Role.ELECTION_ADMIN, Role.SUPER_ADMIN)

    @property
    def is_auditor(self):
        return self.role in (Role.AUDITOR, Role.SUPER_ADMIN)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"
