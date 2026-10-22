"""
API Views for College ID, OTP, and QR Identity Verification.
CampusVote Smart ID-Based College Voting System.
"""

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.accounts.permissions import IsStudent
from apps.verification.serializers import (
    VerificationStartSerializer,
    VerificationOtpVerifySerializer,
    VerificationOtpResendSerializer,
    QrPayloadValidateSerializer,
    VerificationSessionStatusSerializer
)
from apps.verification.services import VerificationService
from apps.verification.qr_service import generate_signed_qr_payload


class VerificationStartView(APIView):
    """
    POST /api/v1/verification/id/start/
    Initiates identity verification challenge for a submitted College ID.
    Looks up student in official registry, validates standing, and dispatches OTP.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'verification_start'

    def post(self, request, *args, **kwargs):
        serializer = VerificationStartSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid request parameters", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        college_id = serializer.validated_data['college_id']
        channel = serializer.validated_data.get('channel', 'EMAIL')

        client_ip = request.META.get('HTTP_X_FORWARDED_FOR') or request.META.get('REMOTE_ADDR')
        if client_ip:
            client_ip = client_ip.split(',')[0].strip()
        user_agent = request.META.get('HTTP_USER_AGENT', '')

        success, data, error_msg = VerificationService.start_verification(
            college_id=college_id,
            channel=channel,
            ip_address=client_ip,
            user_agent=user_agent,
            request=request
        )

        if not success:
            return Response(
                {"error": error_msg or "Verification initialization failed.", "details": data},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(data, status=status.HTTP_200_OK)


class VerificationOtpVerifyView(APIView):
    """
    POST /api/v1/verification/otp/verify/
    Validates the submitted OTP challenge in constant time.
    Upon success, authenticates the student into the active HTTP session.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'verification_verify'

    def post(self, request, *args, **kwargs):
        serializer = VerificationOtpVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid verification submission", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        session_id = str(serializer.validated_data['session_id'])
        otp = serializer.validated_data['otp']

        success, data, error_msg = VerificationService.verify_otp(
            session_id=session_id,
            candidate_otp=otp,
            request=request
        )

        if not success:
            http_status = status.HTTP_423_LOCKED if data.get('is_locked') else status.HTTP_400_BAD_REQUEST
            return Response(
                {"error": error_msg or "Verification failed.", "details": data},
                status=http_status
            )

        return Response(data, status=status.HTTP_200_OK)


class VerificationOtpResendView(APIView):
    """
    POST /api/v1/verification/otp/resend/
    Dispatches a new OTP challenge, enforcing cooldown and attempt constraints.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'verification_resend'

    def post(self, request, *args, **kwargs):
        serializer = VerificationOtpResendSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid session identifier", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        session_id = str(serializer.validated_data['session_id'])

        success, data, error_msg = VerificationService.resend_otp(
            session_id=session_id,
            request=request
        )

        if not success:
            return Response(
                {"error": error_msg or "Failed to resend code.", "details": data},
                status=status.HTTP_429_TOO_MANY_REQUESTS if 'wait' in error_msg.lower() else status.HTTP_400_BAD_REQUEST
            )

        return Response(data, status=status.HTTP_200_OK)


class QrValidateView(APIView):
    """
    POST /api/v1/verification/qr/validate/
    Server-side validation of scanned student ID badge QR payload.
    Verifies signature and active student status without directly authenticating.
    """
    permission_classes = [AllowAny]
    throttle_scope = 'verification_qr'

    def post(self, request, *args, **kwargs):
        serializer = QrPayloadValidateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid QR payload submission", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        qr_payload = serializer.validated_data['qr_payload']

        success, data, error_msg = VerificationService.validate_qr_code(
            qr_payload=qr_payload,
            request=request
        )

        if not success:
            return Response(
                {"error": error_msg or "QR validation failed.", "details": data},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(data, status=status.HTTP_200_OK)


class VerificationStatusView(APIView):
    """
    GET /api/v1/verification/status/
    Returns non-sensitive status and countdown metrics for an active session.
    """
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        session_id = request.query_params.get('session_id')
        if not session_id:
            return Response(
                {"error": "Query parameter 'session_id' is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        success, data, error_msg = VerificationService.get_session_status(session_id)
        if not success:
            return Response({"error": error_msg}, status=status.HTTP_404_NOT_FOUND)

        return Response(data, status=status.HTTP_200_OK)


class MyStudentQrCodeView(APIView):
    """
    GET /api/v1/verification/qr/my-code/
    Returns a cryptographically signed institutional QR token for the authenticated student.
    Can be scanned at campus polling stations or terminal check-in.
    """
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request, *args, **kwargs):
        user = request.user
        college_id = user.college_id

        if not college_id and hasattr(user, 'student_record') and user.student_record:
            college_id = user.student_record.college_id

        if not college_id:
            return Response(
                {"error": "No verified student College ID associated with this account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        signed_token = generate_signed_qr_payload(college_id)

        return Response({
            'college_id': college_id,
            'student_name': user.full_name,
            'qr_payload': signed_token,
            'format': 'CAMPUSVOTE_SIGNED_TOKEN',
            'valid_hours': 24,
            'message': "Official institutional QR token generated."
        }, status=status.HTTP_200_OK)
