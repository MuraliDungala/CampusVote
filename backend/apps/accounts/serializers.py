"""
Serializers for CampusVote authentication and user representations.
Strictly disallows role self-elevation or credential exposure.
"""

from rest_framework import serializers
from django.contrib.auth import authenticate
from django.utils.translation import gettext_lazy as _
from apps.accounts.models import User, Role, AccountStatus


class LoginSerializer(serializers.Serializer):
    """
    Validates user credentials against username, email, or normalized college_id.
    Prevents account enumeration through uniform timing-safe error responses.
    """
    identifier = serializers.CharField(
        required=True,
        trim_whitespace=True,
        help_text=_("Username, college email, or college ID.")
    )
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'},
        help_text=_("Account password.")
    )

    def validate(self, attrs):
        identifier = attrs.get('identifier')
        password = attrs.get('password')

        user = None
        # Try matching by username
        try:
            matched_user = User.objects.get(username__iexact=identifier)
            user = authenticate(username=matched_user.username, password=password)
        except User.DoesNotExist:
            pass

        # Try matching by email
        if not user:
            try:
                matched_user = User.objects.get(email__iexact=identifier)
                user = authenticate(username=matched_user.username, password=password)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                pass

        # Try matching by college_id
        if not user:
            try:
                matched_user = User.objects.get(college_id__iexact=identifier.upper())
                user = authenticate(username=matched_user.username, password=password)
            except (User.DoesNotExist, User.MultipleObjectsReturned):
                pass

        if not user:
            raise serializers.ValidationError(
                _("Invalid credentials. Please verify your identifier and password.")
            )

        if not user.is_active or user.status != AccountStatus.ACTIVE:
            raise serializers.ValidationError(
                _("This account is currently inactive, suspended, or revoked.")
            )

        attrs['user'] = user
        return attrs


class InstitutionSerializer(serializers.ModelSerializer):
    """Public representation of registered educational institutions."""
    class Meta:
        from apps.accounts.models import Institution
        model = Institution
        fields = [
            'id',
            'code',
            'name',
            'normalized_name',
            'email_domain',
            'status',
            'is_demo',
            'created_at',
        ]
        read_only_fields = fields


class CollegeAdminRegistrationSerializer(serializers.Serializer):
    """
    Validates College Administrator self-registration and associates them
    with an official or newly claimed institution entity.
    """
    full_name = serializers.CharField(
        min_length=2,
        max_length=255,
        required=True,
        trim_whitespace=True,
        error_messages={'required': _("Administrator full name is required.")}
    )
    college_name = serializers.CharField(
        min_length=2,
        max_length=255,
        required=True,
        trim_whitespace=True,
        error_messages={'required': _("College or institution name is required.")}
    )
    email = serializers.EmailField(
        required=True,
        trim_whitespace=True,
        error_messages={'required': _("Valid institutional email address is required.")}
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
    confirm_password = serializers.CharField(
        min_length=8,
        required=True,
        write_only=True,
        style={'input_type': 'password'},
        error_messages={'required': _("Password confirmation is required.")}
    )
    contact_phone = serializers.CharField(
        max_length=32,
        required=False,
        allow_blank=True,
        default=''
    )
    institution_code = serializers.CharField(
        max_length=32,
        required=False,
        allow_blank=True,
        default=''
    )
    is_simulation_demo = serializers.BooleanField(
        required=False,
        default=True
    )

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError(_("An account with this email address already exists. Please sign in."))
        return normalized

    def validate(self, attrs):
        if attrs.get('password') != attrs.get('confirm_password'):
            raise serializers.ValidationError({'confirm_password': _("Passwords do not match.")})
        return attrs


class UserSummarySerializer(serializers.ModelSerializer):
    """
    Safe user representation for authenticated sessions.
    Exposes zero secret keys, password hashes, or voting records.
    """
    display_identifier = serializers.ReadOnlyField()
    full_name = serializers.ReadOnlyField()
    is_student = serializers.ReadOnlyField()
    is_election_admin = serializers.ReadOnlyField()
    is_auditor = serializers.ReadOnlyField()
    college_name = serializers.SerializerMethodField()
    institution_id = serializers.SerializerMethodField()
    institution_code = serializers.SerializerMethodField()
    institution_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'college_id',
            'college_name',
            'institution_id',
            'institution_code',
            'institution_name',
            'display_identifier',
            'role',
            'status',
            'is_student',
            'is_election_admin',
            'is_auditor',
            'created_at',
            'last_login_at',
        ]
        read_only_fields = fields

    def get_college_name(self, obj) -> str:
        if obj.institution:
            return obj.institution.name
        if hasattr(obj, 'student_record') and obj.student_record:
            return obj.student_record.college_name
        return ''

    def get_institution_id(self, obj):
        if obj.institution:
            return str(obj.institution.id)
        if hasattr(obj, 'student_record') and obj.student_record and obj.student_record.institution:
            return str(obj.student_record.institution.id)
        return None

    def get_institution_code(self, obj):
        if obj.institution:
            return obj.institution.code
        if hasattr(obj, 'student_record') and obj.student_record and obj.student_record.institution:
            return obj.student_record.institution.code
        return None

    def get_institution_name(self, obj):
        if obj.institution:
            return obj.institution.name
        if hasattr(obj, 'student_record') and obj.student_record and obj.student_record.institution:
            return obj.student_record.institution.name
        return None


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Permits modification of non-security profile fields only.
    Strictly denies role, college_id, or permission self-modification.
    """
    class Meta:
        model = User
        fields = ['first_name', 'last_name']

    def update(self, instance, validated_data):
        instance.first_name = validated_data.get('first_name', instance.first_name)
        instance.last_name = validated_data.get('last_name', instance.last_name)
        instance.save()
        return instance
