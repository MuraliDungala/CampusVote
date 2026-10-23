"""
OTP Delivery Providers for CampusVote.
Smart ID-Based College Voting System.
Provides distinct delivery adapters for Development (Mock), Production Institutional Email,
and Production SMS Gateways.
"""

import logging
from abc import ABC, abstractmethod
from typing import Optional
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


class VerificationDeliveryError(Exception):
    """Base exception for verification delivery failures."""
    pass


class EmailConfigurationError(VerificationDeliveryError):
    """Raised when institutional email delivery settings are missing or incomplete."""
    pass


class EmailDeliveryError(VerificationDeliveryError):
    """Raised when the email provider fails or rejects delivery."""
    pass


def is_email_configured() -> tuple[bool, str]:
    """
    Safely checks whether the email backend has valid operational settings.
    Never exposes passwords, tokens, or private credentials in the return message.
    """
    backend = getattr(settings, 'EMAIL_BACKEND', '')
    if 'console' in backend or 'locmem' in backend or 'filebased' in backend:
        return True, "Development console/memory email backend active."

    # If mock provider explicitly allowed in dev/test
    if getattr(settings, 'DEBUG', False) or getattr(settings, 'ALLOW_MOCK_DELIVERY_IN_TESTS', False):
        if getattr(settings, 'VERIFICATION_DELIVERY_PROVIDER', '').lower() == 'mock':
            return True, "Development mock delivery provider active."

    host = getattr(settings, 'EMAIL_HOST', '').strip()
    user = getattr(settings, 'EMAIL_HOST_USER', '').strip()

    # If host is default localhost / empty and user is empty, SMTP is not configured
    if not host or host in ('localhost', '127.0.0.1'):
        if not user:
            return False, "SMTP server not configured (EMAIL_HOST is unset or localhost without credentials)."

    return True, "Production SMTP delivery configured."


class BaseDeliveryProvider(ABC):
    """Abstract base class for identity verification OTP delivery channels."""

    @abstractmethod
    def send_otp(self, destination: str, otp: str, student_name: str = '') -> bool:
        """
        Dispatches OTP challenge to the specified contact target.
        Returns True if delivery succeeded, False otherwise.
        """
        pass


class MockDeliveryProvider(BaseDeliveryProvider):
    """
    Development-only mock delivery provider.
    Strictly forbidden in production environments.
    Caches sent challenges in an in-memory queue to enable deterministic unit tests.
    """
    _delivery_log: list[dict] = []

    @classmethod
    def get_last_otp(cls, destination: Optional[str] = None) -> Optional[str]:
        """Test helper to retrieve the most recently dispatched OTP for assertions."""
        if not cls._delivery_log:
            return None
        if not destination:
            return cls._delivery_log[-1]['otp']
        for item in reversed(cls._delivery_log):
            if item['destination'] == destination:
                return item['otp']
        return None

    @classmethod
    def get_delivery_count(cls) -> int:
        return len(cls._delivery_log)

    @classmethod
    def clear_log(cls):
        """Clears memory delivery queue between test runs."""
        cls._delivery_log.clear()

    def send_otp(self, destination: str, otp: str, student_name: str = '') -> bool:
        # Prevent mock delivery in true production
        if not settings.DEBUG and not getattr(settings, 'ALLOW_MOCK_DELIVERY_IN_TESTS', False):
            logger.error(
                "MockDeliveryProvider cannot dispatch live verification codes in production (DEBUG=False). "
                "A real institutional Email (SMTP) or SMS delivery provider must be configured."
            )
            return False

        self._delivery_log.append({
            'destination': destination,
            'otp': otp,
            'student_name': student_name,
        })
        if settings.DEBUG:
            logger.info(f"[DEV_MOCK_DELIVERY] Delivered OTP to {destination} for student '{student_name}'.")
        return True


class EmailDeliveryProvider(BaseDeliveryProvider):
    """Production institutional email delivery provider."""

    def send_otp(self, destination: str, otp: str, student_name: str = '') -> bool:
        configured, reason = is_email_configured()
        if not configured:
            logger.warning(
                "Email OTP delivery blocked: %s Required environment variables: "
                "EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, DEFAULT_FROM_EMAIL.",
                reason
            )
            raise EmailConfigurationError(reason)

        subject = "CampusVote Verification Code"
        greeting = f"Hello {student_name}," if student_name else "Hello,"
        message = (
            f"{greeting}\n\n"
            f"Your one-time verification code for CampusVote is: {otp}\n\n"
            f"This code will expire in 5 minutes and is valid for a single verification attempt.\n"
            f"Never share this code with anyone. CampusVote administrators will never ask for your code.\n\n"
            f"If you did not initiate this request, please contact your election administrator immediately.\n\n"
            f"— CampusVote Election Authority"
        )
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@campusvote.local')

        try:
            sent_count = send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[destination],
                fail_silently=False,
            )
            if sent_count < 1:
                logger.error("Email provider returned sent_count=0 for recipient.")
                raise EmailDeliveryError("Email provider failed to accept message for delivery.")
            return True
        except EmailConfigurationError:
            raise
        except Exception as exc:
            logger.error("Email OTP delivery failed to recipient: %s", exc.__class__.__name__)
            raise EmailDeliveryError(f"Email delivery provider encountered an error: {exc}")


class SMSDeliveryProvider(BaseDeliveryProvider):
    """Production institutional SMS delivery gateway adapter."""

    def send_otp(self, destination: str, otp: str, student_name: str = '') -> bool:
        # Extensible gateway adapter for institutional SMS gateways or Twilio/SNS
        logger.warning(
            f"SMS delivery attempted for {destination}, but production SMS gateway credentials "
            f"have not been configured. Falling back safely."
        )
        return False


def get_delivery_provider(channel: str = 'EMAIL') -> BaseDeliveryProvider:
    """
    Resolves active delivery provider based on settings and environment.
    Fails safely if configuration is invalid.
    """
    provider_name = getattr(
        settings,
        'VERIFICATION_DELIVERY_PROVIDER',
        'mock' if settings.DEBUG else 'email'
    ).lower()

    if provider_name == 'mock':
        return MockDeliveryProvider()
    elif provider_name == 'email':
        return EmailDeliveryProvider()
    elif provider_name == 'sms':
        return SMSDeliveryProvider()
    else:
        if settings.DEBUG:
            return MockDeliveryProvider()
        logger.error(
            f"Unknown or unconfigured delivery provider '{provider_name}'. "
            "Falling back to EmailDeliveryProvider."
        )
        return EmailDeliveryProvider()
