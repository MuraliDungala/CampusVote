"""
Serializers for Identity Verification and OTP Challenge Workflows.
CampusVote Smart ID-Based College Voting System.
"""

from rest_framework import serializers
from apps.verification.models import VerificationChannel, VerificationState


class VerificationStartSerializer(serializers.Serializer):
    """Payload to initiate a College ID verification challenge."""
    college_id = serializers.CharField(
        max_length=64,
        required=True,
        trim_whitespace=True,
        help_text="Institutional student identification number."
    )
    channel = serializers.ChoiceField(
        choices=VerificationChannel.choices,
        default=VerificationChannel.EMAIL,
        help_text="Requested challenge delivery channel."
    )

    def validate_college_id(self, value):
        val = value.strip().upper()
        if not val:
            raise serializers.ValidationError("College ID cannot be blank.")
        return val


class VerificationOtpVerifySerializer(serializers.Serializer):
    """Payload to submit candidate OTP for validation and session authentication."""
    session_id = serializers.UUIDField(
        required=True,
        help_text="Verification session UUID identifier."
    )
    otp = serializers.CharField(
        min_length=4,
        max_length=10,
        required=True,
        trim_whitespace=True,
        help_text="One-time verification code."
    )

    def validate_otp(self, value):
        val = value.strip()
        if not val.isdigit():
            raise serializers.ValidationError("Verification code must be numeric.")
        return val


class VerificationOtpResendSerializer(serializers.Serializer):
    """Payload to request a replacement OTP for an active session."""
    session_id = serializers.UUIDField(
        required=True,
        help_text="Verification session UUID identifier."
    )


class QrPayloadValidateSerializer(serializers.Serializer):
    """Payload for browser QR camera scanner payload submission."""
    qr_payload = serializers.CharField(
        required=True,
        trim_whitespace=True,
        help_text="Raw scanned payload string from identity badge QR code."
    )


class VerificationSessionStatusSerializer(serializers.Serializer):
    """Response format for verification challenge state queries."""
    session_id = serializers.UUIDField(read_only=True)
    college_id = serializers.CharField(read_only=True)
    state = serializers.ChoiceField(choices=VerificationState.choices, read_only=True)
    channel = serializers.CharField(read_only=True)
    destination_masked = serializers.CharField(read_only=True)
    attempts_count = serializers.IntegerField(read_only=True)
    max_attempts = serializers.IntegerField(read_only=True)
    resend_count = serializers.IntegerField(read_only=True)
    max_resends = serializers.IntegerField(read_only=True)
    expires_in_seconds = serializers.IntegerField(read_only=True)
    resend_cooldown_seconds = serializers.IntegerField(read_only=True)
    is_locked = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
