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
