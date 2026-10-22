# CampusVote — Staging Deployment Architecture & Operations Runbook

**Project**: Smart ID-Based College Voting System with Real-Time Voter Monitoring  
**Brand**: CampusVote  
**Document Type**: Staging Architecture, Configuration, and Non-Destructive Deployment Plan  
**Target Environment**: Staging (Pre-Production Validation)  
**Security Posture**: Fail-Closed Real-Voting Protection Active  

---

## 1. Staging Architecture & Service Topology

```mermaid
graph TD
    User([Voter / Administrator Browser]) -->|HTTPS: 443 / WSS: 443| NGINX[NGINX Reverse Proxy & TLS Terminator]

    subgraph Staging Host / Container Network
        NGINX -->|Static Files /dist/| FrontendStatic[(Precompiled React 18 SPA)]
        NGINX -->|Proxy /api/ & /admin/| DaphneCluster[Daphne ASGI Server Cluster\n4 Workers: Ports 8000-8003]
        NGINX -->|Upgrade /ws/| DaphneCluster

        DaphneCluster --> Django[CampusVote Django REST Service Layer]
        
        Django -->|psycopg 3.2 Pool| Postgres[(PostgreSQL 15 Primary\nDatabase: campusvote_staging)]
        Django -->|channels_redis 4.3| Redis[(Redis 7.2 Message Broker\nChannel Layer & Cache)]
        
        Django -->|SMTP / TLS: 587| StagingSMTP[Institutional SMTP Gateway\nNotifications & OTPs]
    end

    subgraph Security & Governance Boundary
        Django -.->|BLOCKED 403| RealVotingGate[Fail-Closed Real Voting Barrier\nINDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED = False]
    end
```

### Component Responsibilities:
1. **Frontend Presentation Layer**: React 18 + TypeScript SPA precompiled via Vite into minified, hash-versioned static chunks (`vendor-react`, `vendor-icons`, `vendor-qrcode`, `index`).
2. **Reverse Proxy & TLS Terminator (NGINX)**: Terminate TLSv1.3, enforce HTTP Strict Transport Security (HSTS), serve static bundles directly with gzip/brotli caching, and proxy dynamic REST API and WebSocket traffic.
3. **Application Layer (Daphne ASGI Cluster)**: 2–4 Daphne ASGI processes running Django 5 with Channels, handling concurrent HTTP requests and stateful WebSocket connections.
4. **Relational Database (PostgreSQL 15+)**: ACID transactions, row-level locking (`select_for_update`), student registry, election definitions, audit log trail, and decoupled anonymous ballot vault.
5. **Real-Time Channel Broker (Redis 7.2)**: Distributed cross-worker publish/subscribe message bus powering live turnout telemetry broadcast.
6. **Notification Gateway**: Institutional SMTP server delivering 6-digit verification OTPs to students' official institutional email accounts.

---

## 2. Environment Configuration

### 2.1 Backend Environment Configuration (`.env.staging.example`)

A staging environment file must be created at the repository root as `.env`. The template is available at `.env.staging.example`:

| Variable | Staging Setting | Description |
| :--- | :--- | :--- |
| `DJANGO_DEBUG` | `False` | **Mandatory**. Disables debug error views and activates production security headers. |
| `DJANGO_SECRET_KEY` | `64+ char random string` | Fails server startup if default development key is detected when `DEBUG=False`. |
| `ENVIRONMENT` | `staging` | Identifies deployment tier for telemetry and health reports. |
| `DJANGO_ALLOWED_HOSTS` | `staging.campusvote.institution.edu,...` | Whitelist of allowed Host header domain names. |
| `DB_ENGINE` | `postgresql` | Selects PostgreSQL backend via `psycopg`. |
| `DB_NAME` | `campusvote_staging` | Staging database name. |
| `DB_USER` | `campusvote_staging_user` | Dedicated least-privilege PostgreSQL user. |
| `DB_PASSWORD` | `<secure_password>` | Strong database password. |
| `DB_HOST` | `127.0.0.1` | Hostname or container IP of PostgreSQL server. |
| `DB_PORT` | `5432` | Standard PostgreSQL port. |
| `DB_CONN_MAX_AGE` | `60` | Persistent connection timeout (seconds). |
| `DATABASE_URL` | Optional URI | `postgresql://user:pass@host:5432/dbname` (alternative to discrete fields). |
| `CHANNEL_LAYER_BACKEND` | `channels_redis.core.RedisChannelLayer` | Enables Redis channel layer for multi-worker ASGI instances. |
| `REDIS_HOST` | `127.0.0.1` | Redis hostname. |
| `REDIS_PORT` | `6379` | Redis port. |
| `REDIS_URL` | Optional URI | `redis://:password@host:6379/0`. |
| `CORS_ALLOWED_ORIGINS` | `https://staging.campusvote.institution.edu` | Whitelisted origins permitted to transmit cross-origin AJAX requests. |
| `CSRF_TRUSTED_ORIGINS` | `https://staging.campusvote.institution.edu` | Whitelisted origins permitted to submit POST/PUT/DELETE forms. |
| `DJANGO_SECURE_SSL_REDIRECT` | `True` | Automatically redirects all plaintext HTTP traffic to HTTPS. |
| `DJANGO_SECURE_HSTS_SECONDS` | `31536000` | Enables HTTP Strict Transport Security for 1 year. |
| `CSP_EXTRA_CONNECT_SRC` | `wss://staging-api...` | Optional additional origins for Content Security Policy connect directive. |
| `VERIFICATION_DELIVERY_PROVIDER` | `email` | Selects `EmailDeliveryProvider` using institutional SMTP. |
| `EMAIL_BACKEND` | `django.core.mail.backends.smtp.EmailBackend` | Production SMTP mail backend. |
| `EMAIL_HOST` | `smtp.institution.edu` | Institutional mail transfer agent hostname. |
| `EMAIL_PORT` | `587` | Standard submission port with STARTTLS. |
| `EMAIL_USE_TLS` | `True` | Enforces TLS encryption for mail dispatch. |
| `DEFAULT_FROM_EMAIL` | `noreply@campusvote.institution.edu` | Verified sender email address. |
| `DJANGO_LOG_LEVEL` | `INFO` | Structured logging verbosity level. |
| `FAIL_CLOSED_VOTING_RESTRICTION_ACTIVE` | `True` | **NON-NEGOTIABLE**. Live voting barrier. |
| `INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED` | `False` | **NON-NEGOTIABLE**. Cryptographic signoff flag. |

### 2.2 Frontend Environment Configuration (`frontend/.env.example`)

| Variable | Staging Setting | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://staging-api.institution.edu` | Base URL for REST API. Leave blank if unified under single NGINX origin. |
| `VITE_WS_BASE_URL` | `wss://staging-api.institution.edu` | Base URL for WebSockets. Leave blank if unified under single NGINX origin. |

---

## 3. PostgreSQL 15 & Redis 7.2 Setup Instructions

### Option A: Staging Container Infrastructure (Docker Compose)
A dedicated staging Compose file is provided in `docker-compose.staging.yml`:

```bash
# 1. Start PostgreSQL 15 and Redis 7.2 services
docker compose -f docker-compose.staging.yml up -d

# 2. Verify container health status
docker compose -f docker-compose.staging.yml ps
```

### Option B: Native Linux System Packages (Ubuntu 22.04 / 24.04 LTS)

#### 1. PostgreSQL 15 Installation & Provisioning
```bash
# Install PostgreSQL 15
sudo apt update
sudo apt install -y postgresql-15 postgresql-client-15

# Create least-privilege staging database user and schema
sudo -u postgres psql << EOF
CREATE USER campusvote_staging_user WITH PASSWORD 'strong_unique_staging_password';
CREATE DATABASE campusvote_staging WITH OWNER campusvote_staging_user ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE campusvote_staging TO campusvote_staging_user;
EOF

# Verify connectivity
PGPASSWORD='strong_unique_staging_password' psql -h 127.0.0.1 -U campusvote_staging_user -d campusvote_staging -c "SELECT version();"
```

#### 2. Redis 7.2 Installation & Configuration
```bash
# Install Redis
sudo apt install -y redis-server

# Configure Redis to bind to localhost and enable AOF persistence
sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sudo sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf

# Restart and verify Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server
redis-cli ping
# Expected output: PONG
```

---

## 4. Safe Staging Deployment Procedure (Runbook)

### Pre-Deployment Safety Rules:
* **No destructive database resets**: Do not execute `flush` or drop tables.
* **Preserve fail-closed restriction**: `INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED` must remain `False`.
* **Zero secret exposure**: Never print `.env` to build logs or terminals.

### Step 1: Clone Repository & Create Dedicated Python Virtual Environment
```bash
git clone <repository_url> /opt/campusvote
cd /opt/campusvote

# Create clean Python virtual environment
python3 -m venv backend/venv
source backend/venv/bin/activate

# Install locked production dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### Step 2: Configure Staging Environment File
```bash
cp .env.staging.example .env
chmod 600 .env

# Populate unique DJANGO_SECRET_KEY, DB_PASSWORD, and SMTP credentials
nano .env
```

### Step 3: Run Database Migrations
```bash
source backend/venv/bin/activate
python backend/manage.py makemigrations --check
python backend/manage.py migrate --noinput
```

### Step 4: Collect Backend Static Assets
```bash
python backend/manage.py collectstatic --noinput
```
*Output*: Static assets gathered in `backend/staticfiles/` for Django Admin and API browser styling.

### Step 5: Build Frontend Production Bundle
```bash
cd /opt/campusvote/frontend
npm ci
npm run build
```
*Output*: Optimized, chunk-split assets in `frontend/dist/`.

### Step 6: System Security & Deployment Sanity Check
```bash
cd /opt/campusvote
python backend/manage.py check --deploy
```
*Expected*: System check reports 0 issues.

### Step 7: Configure Daphne ASGI Multi-Worker Systemd Service
Create `/etc/systemd/system/campusvote-asgi@.service`:

```ini
[Unit]
Description=CampusVote Daphne ASGI Worker %i
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=campusvote
Group=campusvote
WorkingDirectory=/opt/campusvote
EnvironmentFile=/opt/campusvote/.env
ExecStart=/opt/campusvote/backend/venv/bin/daphne -b 127.0.0.1 -p 800%i config.asgi:application
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Enable and start 4 worker instances:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now campusvote-asgi@{0..3}
```

### Step 8: Configure NGINX Reverse Proxy & TLS Termination
Create `/etc/nginx/sites-available/campusvote-staging.conf`:

```nginx
upstream campusvote_asgi {
    server 127.0.0.1:8000;
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
    server 127.0.0.1:8003;
}

server {
    listen 80;
    server_name staging.campusvote.institution.edu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.campusvote.institution.edu;

    ssl_certificate /etc/ssl/certs/campusvote_staging.crt;
    ssl_certificate_key /etc/ssl/private/campusvote_staging.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Static Frontend SPA
    root /opt/campusvote/frontend/dist;
    index index.html;

    # Frontend Routing Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Django Admin Static Files
    location /static/ {
        alias /opt/campusvote/backend/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # REST API Endpoints
    location /api/ {
        proxy_pass http://campusvote_asgi;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }

    # Django Admin Console
    location /admin/ {
        proxy_pass http://campusvote_asgi;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Daphne WebSocket Upgrade Route
    location /ws/ {
        proxy_pass http://campusvote_asgi;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable site and reload NGINX:
```bash
sudo ln -s /etc/nginx/sites-available/campusvote-staging.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Staging Validation Checklist

| Phase | Test Objective | Validation Command / Action | Acceptance Criteria |
| :---: | :--- | :--- | :--- |
| **01** | **Service Health Check** | `curl -i https://staging.../api/v1/health/` | HTTP 200; `database.status == "connected"`, `database.engine == "postgresql"`, `redis.status == "connected"`, `redis.required == true`. |
| **02** | **HTTPS & Security Headers** | `curl -I https://staging.../api/v1/health/` | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` present. |
| **03** | **Student Smart ID Login** | Navigate to `/login`, enter `STU-2026-001` | Triggers Phase 4 OTP dispatch to registered student email. |
| **04** | **OTP Delivery & Rate Limit** | Check institutional inbox for 6-digit code. Test 5 failed attempts. | OTP arrives within 10s. 5th invalid attempt triggers 15-minute temporary lockout. |
| **05** | **RBAC Boundaries** | Authenticate as `STUDENT`; attempt to access `/admin` and `/auditor`. | Direct redirect to `/unauthorized` with HTTP 403 status indicator. |
| **06** | **Batch Roster Import** | As Admin, upload sample roster CSV at `/admin/students/import`. | Schema validation preview loads; batch commitment adds records atomically without partial writes. |
| **07** | **Multi-Worker WebSocket Sync** | Open `/admin/elections/:id/monitor` in two separate browser sessions across different Daphne workers. | Turnout update cast in worker A is immediately received and rendered on worker B via Redis channel layer. |
| **08** | **Cohort Privacy Guard** | Monitor election where cohort turnout is < 5 voters. | Department-level chart displays "[Suppressed for Privacy]" indicator. |
| **09** | **AI Anomaly Detection** | Trigger synthetic off-hours or velocity outlier batch. | Isolation Forest flags alert on `/admin/elections/:id/security`; advisory resolution modal requires mandatory justification. |
| **10** | **Results Governance & Separation of Duties** | Admin A calculates results. Admin A attempts to approve. | System rejects approval with `PermissionError` ("Separation of duties violation: An administrator cannot approve a result they calculated"). |
| **11** | **SHA-256 Digest Reproducibility** | Recalculate result snapshot on staging database. | SHA-256 artifact digest matches stored hash exactly; zero tamper alerts. |
| **12** | **Fail-Closed Voting Gate** | Attempt to cast a ballot in a non-synthetic real election. | System blocks submission with HTTP 403 / application exception; live voting barrier holds firm. |
| **13** | **Unpublished Results Privacy** | Direct browser access to `/elections/:id/results` for unapproved cycle. | Renders privacy placeholder notice without leaking unapproved tallies. |

---

## 6. Actual Test Results & Unresolved Issues

### Verified Test Suites (Current Cycle)
* **Backend Django Test Suite**: **182 Passed, 0 Failed, 0 Errors** (Ran in 105.6s across 12 domain test suites).
* **Frontend Vitest Suite**: **81 Passed, 0 Failed** (Ran in 4.15s across 9 test files).
* **Production Build**: **Clean compilation in 3.18s** (0 TypeScript errors, 0 Rollup errors).
* **Frontend Chunk Splitting**: Successfully resolved 500 kB chunk warning:
  * `vendor-react`: 163.99 kB (53.48 kB gzip)
  * `vendor-icons`: 28.63 kB (5.60 kB gzip)
  * `vendor-qrcode`: 334.30 kB (99.84 kB gzip)
  * `index`: 325.27 kB (64.90 kB gzip)
* **Django Migrations**: Clean state (`No changes detected`).
* **Django System Checks**: Clean state (`System check identified no issues`).

### Unresolved Maintenance Notes
1. **NPM Build-Time Audit Warnings**:
   * 15 vulnerabilities flagged in development/build tooling (`vitest`, `tinypool`, `esbuild`, `chokidar`/`braces` under Tailwind 3.4, `react-router` 6).
   * *Assessment*: These are build-time only dependencies and do not execute on servers. Major upgrades (Tailwind 4, Vite 8, React Router 7) were deliberately deferred to maintain project stability.
2. **PostgreSQL Concurrency Load Testing**:
   * Automated tests currently run against local database. High-concurrency benchmarks under 500+ simultaneous check-ins must be executed in staging once PostgreSQL 15 and Redis 7.2 are provisioned.

---

## 7. Changes Made to Existing Project

The following non-destructive improvements were implemented in this preparation phase:

1. **`backend/config/settings.py`**:
   * Added `DATABASE_URL` parsing alongside `DB_ENGINE=postgresql` with connection pooling (`CONN_MAX_AGE=60`).
   * Cleaned up duplicate `CHANNEL_LAYERS` definitions and added `channels_redis` configuration with connection pooling and password/URL support.
   * Configured `CSRF_TRUSTED_ORIGINS` to read from environment variable `CSRF_TRUSTED_ORIGINS`.
   * Configured `MEDIA_URL = '/media/'` and `MEDIA_ROOT = BASE_DIR / 'media'`.
   * Added standard Django SMTP configuration mapped to environment variables (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`).
   * Added structured, production-grade `LOGGING` dictionary with verbose formatters for console and application domain loggers.
   * Explicitly declared `INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED = False` and `FAIL_CLOSED_VOTING_RESTRICTION_ACTIVE = True`.
2. **`backend/config/health.py`**:
   * Enhanced Redis health probe with `REDIS_URL`, password, and timeout protection.
   * Made overall service health check aware of whether Redis is required (`CHANNEL_LAYER_BACKEND == 'channels_redis.core.RedisChannelLayer'`), reporting HTTP 503 if required Redis instance fails.
3. **`backend/config/middleware.py`**:
   * Added `CSP_EXTRA_CONNECT_SRC` support to allow staging domain WebSocket connect-src overrides.
4. **`backend/requirements.txt`**:
   * Added `channels-redis>=4.2.0,<4.4.0` for Redis channel layer support.
5. **`frontend/vite.config.ts`**:
   * Added Rollup `manualChunks` splitting (`vendor-react`, `vendor-icons`, `vendor-qrcode`), reducing maximum bundle chunk size from 853 kB down to 325 kB.
   * Added WebSocket proxying (`/ws` with `ws: true`) in Vite dev server configuration.
6. **`frontend/src/services/api.ts`**:
   * Added `VITE_API_BASE_URL` resolution for cross-origin staging deployments.
7. **`frontend/src/pages/admin/ElectionMonitoringDashboard.tsx`**:
   * Added `VITE_WS_BASE_URL` resolution for configurable staging WebSocket endpoints.
8. **Configuration Templates Created**:
   * `.env.staging.example` (Root staging environment template).
   * `frontend/.env.example` (Frontend environment template).
   * `docker-compose.staging.yml` (Staging PostgreSQL 15 & Redis 7.2 services).

---

## 8. Requirements Remaining Before Production Promotion

The application is fully prepped for **staging deployment**. The following milestones remain strictly mandatory before promoting to binding, production elections:

1. **Independent Cryptographic Security Review**: Formal evaluation of the anonymous ballot protocol, participation token generation, and vault decoupling by an external security firm or academic team.
2. **Institutional Election Commission Signoff**: Formal institutional board approval of election bylaws, candidate dispute policies, and multi-administrator Separation of Duties credentials.
3. **Production Infrastructure Provisioning**: Target PostgreSQL 15 cluster, Redis 7.2 sentinel/cluster, and NGINX reverse proxy with valid institutional TLSv1.3 certificate.
4. **Institutional Gateway Credentials**: Connecting production institutional SMTP and SMS gateway credentials to replace mock/staging providers.
5. **Removal of Fail-Closed Gate**: Only after items 1 through 4 are verified may `INDEPENDENT_VOTING_SECURITY_REVIEW_APPROVED` be set to `True`.
