"""
Automated unit and integration tests for the /api/v1/health/ endpoint.
"""

from unittest.mock import patch
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class HealthCheckEndpointTests(APITestCase):
    """Verify health check logic, error handling, and payload sanitization."""

    def test_health_check_success(self):
        """Test health endpoint returns HTTP 200 and healthy status under normal conditions."""
        url = reverse('api-health-check')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        self.assertEqual(data.get('status'), 'healthy')
        self.assertEqual(data.get('service'), 'campusvote-api')
        self.assertEqual(data.get('version'), 'v1')
        self.assertIn('dependencies', data)

        db_dep = data['dependencies'].get('database', {})
        self.assertEqual(db_dep.get('status'), 'connected')
        self.assertIn(db_dep.get('engine'), ['sqlite', 'postgresql'])

        # Security check: Ensure zero credential leakage
        data_str = str(data).lower()
        self.assertNotIn('password', data_str)
        self.assertNotIn('secret', data_str)
        self.assertNotIn('traceback', data_str)

    @patch('django.db.connection.cursor')
    def test_health_check_database_failure_returns_503(self, mock_cursor):
        """Test that database failure results in HTTP 503 and reports 'unhealthy' overall."""
        mock_cursor.side_effect = Exception("Simulated database failure")

        url = reverse('api-health-check')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        data = response.json()

        self.assertEqual(data.get('status'), 'unhealthy')
        self.assertEqual(data['dependencies']['database']['status'], 'unhealthy')

    def test_health_check_email_dependency_status(self):
        """Test that email dependency is reported cleanly without credential leakage."""
        url = reverse('api-health-check')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        self.assertIn('email', data['dependencies'])
        email_dep = data['dependencies']['email']
        self.assertIn('configured', email_dep)
        self.assertIn('provider', email_dep)
        self.assertIn('status', email_dep)

        # Zero leakage check
        email_str = str(email_dep).lower()
        self.assertNotIn('password', email_str)
        self.assertNotIn('smtp', email_str)
        self.assertNotIn('user', email_str)

    def test_is_email_configured_detects_missing_smtp(self):
        """Verify is_email_configured detects unconfigured SMTP in production settings."""
        from apps.verification.providers import is_email_configured
        from django.test import override_settings

        with override_settings(
            DEBUG=False,
            ALLOW_MOCK_DELIVERY_IN_TESTS=False,
            EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend',
            EMAIL_HOST='localhost',
            EMAIL_HOST_USER='',
            VERIFICATION_DELIVERY_PROVIDER='email'
        ):
            configured, reason = is_email_configured()
            self.assertFalse(configured)
            self.assertIn('SMTP server not configured', reason)
