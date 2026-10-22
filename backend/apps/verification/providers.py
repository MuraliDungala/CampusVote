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
            raise RuntimeError(
                "MockDeliveryProvider is strictly prohibited in a production environment. "
                "Configure a real Email or SMS delivery provider."
            )

        self._delivery_log.append({
            'destination': destination,
            'otp': otp,
            'student_name': student_name,
        })
        logger.info(f"[DEV_MOCK_DELIVERY] Delivered OTP to {destination} for student '{student_name}'.")
        return True


class EmailDeliveryProvider(BaseDeliveryProvider):
    """Production institutional email delivery provider."""

    def send_otp(self, destination: str, otp: str, student_name: str = '') -> bool:
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
            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[destination],
                fail_silently=False,
            )
            return True
        except Exception as exc:
            logger.error(f"Email OTP delivery failed to '{destination}': {exc}")
            return False


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
    provider_name = getattr(settings, 'VERIFICATION_DELIVERY_PROVIDER', 'mock').lower()

    if provider_name == 'mock':
        return MockDeliveryProvider()
    elif provider_name == 'email':
        return EmailDeliveryProvider()
    elif provider_name == 'sms':
        return SMSDeliveryProvider()
    else:
        if settings.DEBUG:
            return MockDeliveryProvider()
        raise ValueError(f"Unknown or unconfigured delivery provider: '{provider_name}'")
