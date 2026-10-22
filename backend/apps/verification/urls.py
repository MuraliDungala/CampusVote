"""
URL Configuration for Identity Verification and OTP Challenge Workflows.
CampusVote Smart ID-Based College Voting System.
"""

from django.urls import path
from apps.verification.views import (
    VerificationStartView,
    VerificationOtpVerifyView,
    VerificationOtpResendView,
    QrValidateView,
    VerificationStatusView,
    MyStudentQrCodeView
)

app_name = 'verification'

urlpatterns = [
    # College ID validation and OTP initiation
    path('id/start/', VerificationStartView.as_view(), name='verification-start'),

    # OTP validation and session authentication
    path('otp/verify/', VerificationOtpVerifyView.as_view(), name='verification-otp-verify'),

    # Resend OTP challenge
    path('otp/resend/', VerificationOtpResendView.as_view(), name='verification-otp-resend'),

    # QR payload validation
    path('qr/validate/', QrValidateView.as_view(), name='verification-qr-validate'),

    # Current student signed QR code
    path('qr/my-code/', MyStudentQrCodeView.as_view(), name='verification-my-qr'),

    # Verification session status query
    path('status/', VerificationStatusView.as_view(), name='verification-status'),
]
