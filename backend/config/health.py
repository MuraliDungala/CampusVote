"""
Health check endpoint for CampusVote backend service.
Validates process health, relational database connection, and advisory cache availability.
Exposes zero sensitive credentials, stack traces, or environment dumps.
"""

from django.db import connection
from django.utils import timezone
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import os

class HealthCheckView(APIView):
    """
    GET /api/v1/health/
    Returns service health status and dependency checks.
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request, *args, **kwargs):
        # 1. Database Connectivity Check
        db_engine_name = "postgresql" if settings.DB_ENGINE == "postgresql" else "sqlite"
        db_connected = False
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                row = cursor.fetchone()
                if row and row[0] == 1:
                    db_connected = True
        except Exception:
            db_connected = False

        # 2. Redis Connectivity Check
        redis_status = "unavailable"
        redis_required = getattr(settings, 'CHANNEL_LAYER_BACKEND', '') == 'channels_redis.core.RedisChannelLayer'
        try:
            import redis
            redis_url = os.getenv('REDIS_URL', '').strip()
            if redis_url:
                r = redis.Redis.from_url(redis_url, socket_timeout=0.5)
            else:
                redis_host = os.getenv('REDIS_HOST', '127.0.0.1').strip()
                redis_port = int(os.getenv('REDIS_PORT', '6379'))
                redis_password = os.getenv('REDIS_PASSWORD', '').strip() or None
                r = redis.Redis(host=redis_host, port=redis_port, password=redis_password, socket_timeout=0.5)
            if r.ping():
                redis_status = "connected"
        except Exception:
            redis_status = "unavailable"

        # 3. Overall Service Status Evaluation
        # If the primary database is unavailable, or if Redis is required and unavailable, report unhealthy
        is_healthy = db_connected and (not redis_required or redis_status == "connected")
        http_status = status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

        response_payload = {
            "status": "healthy" if is_healthy else "unhealthy",
            "service": "campusvote-api",
            "version": os.getenv("API_VERSION", "v1"),
            "environment": os.getenv("ENVIRONMENT", "development"),
            "timestamp": timezone.now().isoformat(),
            "dependencies": {
                "database": {
                    "status": "connected" if db_connected else "unhealthy",
                    "engine": db_engine_name
                },
                "redis": {
                    "status": redis_status,
                    "required": redis_required
                }
            }
        }

        return Response(response_payload, status=http_status)
