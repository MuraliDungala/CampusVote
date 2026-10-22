"""
Django settings for CampusVote project.
Smart ID-Based College Voting System with Real-Time Voter Monitoring.
"""

from pathlib import Path
import os
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from root or backend directory if present
ROOT_DIR = BASE_DIR.parent
ENV_PATH = ROOT_DIR / '.env'
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
else:
    load_dotenv()

from django.core.exceptions import ImproperlyConfigured

# Security & Debug Settings
DEBUG = os.getenv('DJANGO_DEBUG', 'True').strip().lower() in ('true', '1', 'yes')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-development-placeholder-key-campusvote-phase0-scaffold'
    else:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY environment variable must be set in production when DEBUG=False.")
elif not DEBUG and SECRET_KEY.startswith('django-insecure'):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY cannot use an insecure development placeholder in production.")

ALLOWED_HOSTS_ENV = os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,[::1]')
ALLOWED_HOSTS = [host.strip() for host in ALLOWED_HOSTS_ENV.split(',') if host.strip()]

# Automatically allow Render domain in production
RENDER_HOSTNAME = os.getenv('RENDER_EXTERNAL_HOSTNAME')
if RENDER_HOSTNAME and RENDER_HOSTNAME not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(RENDER_HOSTNAME)
if os.getenv('RENDER') and '.onrender.com' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('.onrender.com')

# Maximum upload limits (10 MB to prevent unbounded resource exhaustion attacks)
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# Application definition
INSTALLED_APPS = [
    # Daphne must be listed before django.contrib.staticfiles for ASGI support
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-Party Libraries
    'rest_framework',
    'corsheaders',
    'channels',

    # CampusVote Domain Apps
    'apps.accounts.apps.AccountsConfig',
    'apps.students.apps.StudentsConfig',
    'apps.elections.apps.ElectionsConfig',
    'apps.eligibility.apps.EligibilityConfig',
    'apps.verification.apps.VerificationConfig',
    'apps.voting.apps.VotingConfig',
    'apps.monitoring.apps.MonitoringConfig',
    'apps.anomaly.apps.AnomalyConfig',
    'apps.audit.apps.AuditConfig',
    'apps.results.apps.ResultsConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'config.middleware.SecurityHeadersMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ------------------------------------------------------------------------------
# HTTP Security Headers & Protection (OWASP Standards)
# ------------------------------------------------------------------------------
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# Production HTTPS / SSL Enforcement
if not DEBUG:
    SECURE_SSL_REDIRECT = os.getenv('DJANGO_SECURE_SSL_REDIRECT', 'True').strip().lower() in ('true', '1', 'yes')
    SECURE_HSTS_SECONDS = int(os.getenv('DJANGO_SECURE_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
else:
    SECURE_SSL_REDIRECT = False
    SECURE_HSTS_SECONDS = 0

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# ------------------------------------------------------------------------------
# Database Configuration
# Defaults to SQLite for immediate, zero-dependency local development.
# Automatically switches to PostgreSQL when DATABASE_URL or DB_ENGINE=postgresql is specified.
# ------------------------------------------------------------------------------
DB_ENGINE = os.getenv('DB_ENGINE', 'sqlite').strip().lower()
DATABASE_URL = os.getenv('DATABASE_URL', '').strip()

if DATABASE_URL:
    from urllib.parse import urlparse, parse_qs, unquote
    _db_url = urlparse(DATABASE_URL)
    _db_options = {}
    if _db_url.query:
        _query_params = parse_qs(_db_url.query)
        for _k, _v in _query_params.items():
            if _v:
                _db_options[_k] = _v[0]

    _db_host = _db_url.hostname or '127.0.0.1'
    if '.' in _db_host and _db_host not in ('127.0.0.1', 'localhost'):
        if 'sslmode' not in _db_options:
            _db_options['sslmode'] = 'require'

    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': unquote(_db_url.path.lstrip('/')) if _db_url.path else '',
            'USER': unquote(_db_url.username) if _db_url.username else '',
            'PASSWORD': unquote(_db_url.password) if _db_url.password else '',
            'HOST': _db_host,
            'PORT': str(_db_url.port or '5432'),
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
            'OPTIONS': _db_options,
        }
    }
elif DB_ENGINE == 'postgresql':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'campusvote_db'),
            'USER': os.getenv('DB_USER', 'campusvote_user'),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', '127.0.0.1'),
            'PORT': os.getenv('DB_PORT', '5432'),
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_USER_MODEL = 'accounts.User'

# ------------------------------------------------------------------------------
# Session & Cookie Security Settings
# ------------------------------------------------------------------------------
SESSION_ENGINE = 'django.contrib.sessions.backends.db'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_AGE = 86400  # 24 hours
SESSION_SAVE_EVERY_REQUEST = True

CSRF_COOKIE_HTTPONLY = False  # Allows client to read csrftoken for X-CSRFToken header
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_TRUSTED_ORIGINS_RAW = os.getenv(
    'CSRF_TRUSTED_ORIGINS',
    os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173')
)
CSRF_TRUSTED_ORIGINS = [orig.strip() for orig in CSRF_TRUSTED_ORIGINS_RAW.split(',') if orig.strip()]
if os.getenv('RENDER'):
    if 'https://*.onrender.com' not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append('https://*.onrender.com')
    if 'https://*.vercel.app' not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append('https://*.vercel.app')

# ------------------------------------------------------------------------------
# Password validation
# ------------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Media & User Uploads
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ------------------------------------------------------------------------------
# Django REST Framework Settings
# ------------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer' if DEBUG else 'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',  # Deny by default
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'user': '120/minute',
        'login': '15/minute',
        'verification_start': '30/minute',
        'verification_verify': '60/minute',
        'verification_resend': '15/minute',
        'verification_qr': '45/minute',
        'register': '20/minute',
        'voter_id_generate': '30/minute',
    },
    'EXCEPTION_HANDLER': 'rest_framework.views.exception_handler',
}

# ------------------------------------------------------------------------------
# Phase 4 Identity Verification & OTP Settings
# ------------------------------------------------------------------------------
VERIFICATION_OTP_LENGTH = int(os.getenv('VERIFICATION_OTP_LENGTH', '6'))
VERIFICATION_OTP_EXPIRY_SECONDS = int(os.getenv('VERIFICATION_OTP_EXPIRY_SECONDS', '300'))
VERIFICATION_RESEND_COOLDOWN_SECONDS = int(os.getenv('VERIFICATION_RESEND_COOLDOWN_SECONDS', '60'))
VERIFICATION_MAX_ATTEMPTS = int(os.getenv('VERIFICATION_MAX_ATTEMPTS', '5'))
VERIFICATION_MAX_RESENDS = int(os.getenv('VERIFICATION_MAX_RESENDS', '3'))
VERIFICATION_LOCKOUT_MINUTES = int(os.getenv('VERIFICATION_LOCKOUT_MINUTES', '15'))
VERIFICATION_DELIVERY_PROVIDER = os.getenv('VERIFICATION_DELIVERY_PROVIDER', 'mock')
VERIFICATION_GENERIC_ERRORS = os.getenv('VERIFICATION_GENERIC_ERRORS', 'False').strip().lower() in ('true', '1', 'yes')
ENABLE_DEV_OTP_INSPECTION = DEBUG

# ------------------------------------------------------------------------------
# CORS Configuration
# ------------------------------------------------------------------------------
CORS_ORIGINS_RAW = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173')
CORS_ALLOWED_ORIGINS = [orig.strip() for orig in CORS_ORIGINS_RAW.split(',') if orig.strip()]
CORS_ALLOW_CREDENTIALS = True

# Permit all Vercel deployment preview and production domains
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.vercel\.app$",
]

# ------------------------------------------------------------------------------
# Phase 6 Real-Time Monitoring & Channel Layers Configuration
# Defaults to in-memory channel layer in development and testing environments.
# Configures channels_redis with connection pooling when CHANNEL_LAYER_BACKEND is set to Redis.
# ------------------------------------------------------------------------------
REDIS_HOST = os.getenv('REDIS_HOST', '127.0.0.1').strip()
REDIS_PORT = os.getenv('REDIS_PORT', '6379').strip()
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', '').strip()
REDIS_URL = os.getenv('REDIS_URL', '').strip()

CHANNEL_LAYER_BACKEND = os.getenv(
    'CHANNEL_LAYER_BACKEND',
    'channels.layers.InMemoryChannelLayer'
).strip()

if CHANNEL_LAYER_BACKEND == 'channels_redis.core.RedisChannelLayer':
    if REDIS_URL:
        _redis_hosts = [REDIS_URL]
    elif REDIS_PASSWORD:
        _redis_hosts = [f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0"]
    else:
        _redis_hosts = [(REDIS_HOST, int(REDIS_PORT))]

    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': _redis_hosts,
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': CHANNEL_LAYER_BACKEND,
        },
    }

# Minimum cohort size required before department-level counts are disclosed.
# Cohorts below this threshold are privacy-suppressed to prevent individual re-identification.
MONITORING_PRIVACY_SUPPRESSION_THRESHOLD = int(
    os.getenv('MONITORING_PRIVACY_SUPPRESSION_THRESHOLD', '5')
)

# ------------------------------------------------------------------------------
# Email Configuration (Standard Django SMTP for Phase 4 Verification)
# ------------------------------------------------------------------------------
EMAIL_BACKEND = os.getenv(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend'
)
EMAIL_HOST = os.getenv('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').strip().lower() in ('true', '1', 'yes')
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'False').strip().lower() in ('true', '1', 'yes')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@campusvote.edu')

# ------------------------------------------------------------------------------
# Logging Configuration
# ------------------------------------------------------------------------------
LOG_LEVEL = os.getenv('DJANGO_LOG_LEVEL', 'INFO').upper()

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} [{name}:{lineno}] {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose' if not DEBUG else 'simple',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': LOG_LEVEL,
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.security': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console'],
            'level': LOG_LEVEL,
            'propagate': False,
        },
    },
}

# ------------------------------------------------------------------------------
# Critical Voting Restriction Safeguards
# MUST REMAIN FALSE UNTIL FORMAL INDEPENDENT CRYPTOGRAPHIC AUDIT AND APPROVAL.
# ------------------------------------------------------------------------------
INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED = False
FAIL_CLOSED_VOTING_RESTRICTION_ACTIVE = True

