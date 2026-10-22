# CampusVote: Smart ID-Based College Voting System with Real-Time Voter Monitoring

[![CampusVote Backend](https://img.shields.io/badge/Django-5.1+-092E20?logo=django&logoColor=white)](https://www.djangoproject.com/)
[![CampusVote Frontend](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest Tests](https://img.shields.io/badge/Frontend%20Tests-81%20Passed-brightgreen)](https://vitest.dev/)
[![Django Tests](https://img.shields.io/badge/Backend%20Tests-182%20Passed-brightgreen)](https://docs.djangoproject.com/en/5.1/topics/testing/)
[![Security Posture](https://img.shields.io/badge/Phase%2010-Ready-blue)](SECURITY.md)

CampusVote is an enterprise collegiate election management and real-time voter turnout monitoring system. It balances **rigorous multi-factor student eligibility verification** with **absolute voter ballot anonymity** through mathematical and structural decoupling.

---

## Current Status: Phase 10 Complete

* **Premium UI/UX Redesign**: Fully modernized landing page with campus hero artwork, student dashboard command center, candidate profile portraits, election discovery cards, and auditor surveillance portal.
* **Automated Backend Testing**: 182 / 182 tests passing (unit, integration, and E2E Scenarios A through G).
* **Automated Frontend Testing**: 81 / 81 tests passing across 9 component and workflow suites.
* **Production Build**: Verified clean bundle generation via `tsc -b && vite build`.
* **Security & Governance**: OWASP HTTP headers, strict Content Security Policy (CSP), production secret enforcement, memory upload bounds, and fail-closed live election voting protection.
* **Deployment Readiness**: Production environment matrix, PostgreSQL and Redis configurations, and institutional runbooks documented.

> [!IMPORTANT]
> **Non-Negotiable Security Restriction**:  
> In accordance with institutional safety standards, **real-election voting remains disabled** by the Phase 5 fail-closed voting gate pending independent cryptographic security audit. All test workflows execute against synthetic data with explicit synthetic labeling.

---

## System Architecture & Technology Stack

| Layer | Technology | Operational Function |
| :--- | :--- | :--- |
| **Frontend SPA** | React 18, TypeScript, Vite, Tailwind CSS, Lucide React, React Router | Modern, responsive UI with deep navy (`#071D38`) / blue aesthetic, accessible components, and role guards. |
| **Backend API** | Python 3.12, Django 5.1+, Django REST Framework, Daphne ASGI, Channels | Enterprise REST API, database transaction safety, rate limiting, and WebSocket events. |
| **Database** | PostgreSQL 15+ (Production) with SQLite 3 Fallback (Local Development) | ACID relational transactions; SQLite provides zero-dependency out-of-the-box local development. |
| **Cache & Real-Time**| Redis 7.2 & In-Memory Fallback | Channel layer for WebSocket turnout streams, rate limit counters, and temporary verification state. |
| **Anomaly Surveillance** | `scikit-learn` Isolation Forest & Heuristic Rules | Advisory, non-punitive surveillance flagging suspicious submission velocities and network patterns. |
| **Security & Headers** | `SecurityHeadersMiddleware`, CSP, HSTS, Secure Cookies | Protection against clickjacking, MIME-sniffing, XSS, and unauthorized framing. |

---

## Repository Structure

```
vote/
├── backend/                       # Django 5+ & DRF ASGI/WSGI Application
│   ├── config/                    # Settings, ASGI routing, security middleware
│   ├── apps/
│   │   ├── accounts/              # User models, authentication, RBAC
│   │   ├── students/              # Student roster registry, CSV batch ingestion
│   │   ├── elections/             # Lifecycle state machine, positions, candidates
│   │   ├── eligibility/           # Rules engine, department/year criteria
│   │   ├── verification/          # OTP engine & HMAC-SHA256 QR nonces
│   │   ├── voting/                # Decoupled blind token issuer, anonymous ballot vault
│   │   ├── monitoring/            # Real-time WebSocket aggregates & turnout metrics
│   │   ├── anomaly/               # Advisory machine learning anomaly surveillance
│   │   ├── results/               # Tabulation, digest verification, publication gates
│   │   └── audit/                 # Append-only audit trail with redaction filters
│   ├── tests/                     # 182 automated backend test suites
│   ├── requirements.txt           # Pinned Python dependencies
│   └── manage.py
├── frontend/                      # React 18+ TypeScript SPA
│   ├── src/
│   │   ├── components/            # Reusable UI component system
│   │   ├── context/               # AuthContext & WebSocket connection hooks
│   │   ├── pages/                 # Public, Student, and Admin route views
│   │   ├── services/              # Type-safe Axios API client
│   │   └── tests/                 # 81 Vitest unit & integration test cases
│   ├── package.json
│   ├── tailwind.config.ts
│   └── vite.config.ts
├── docs/                          # Comprehensive technical documentation
│   ├── ARCHITECTURE.md            # Topology, sequence diagrams, and module boundaries
│   ├── SECURITY.md                # Threat models, privacy boundaries, and reporting
│   ├── TESTING.md                 # Test suite guides and execution matrix
│   ├── DEPLOYMENT.md              # Environment variables, NGINX, and production checklist
│   └── OPERATIONS_RUNBOOK.md      # Startup/shutdown, migrations, and incident response
├── docker-compose.yml             # Optional PostgreSQL 15 & Redis 7.2 services
├── .env.example                   # Development environment template
├── .gitignore
├── SECURITY.md                    # Root security governance policy
└── README.md
```

---

## Setup & Execution Guide (Windows PowerShell)

### 1. Prerequisites
* **Python**: 3.10, 3.11, or 3.12+ (verify with `python --version`)
* **Node.js**: v18.x or v20+ LTS (verify with `node -v` and `npm -v`)
* **Docker Desktop** (Optional): Only required if running containerized PostgreSQL and Redis.

---

### 2. Environment Configuration
Create a local `.env` configuration file from the template:
```powershell
Copy-Item .env.example .env
```
* **Local Development**: Default settings use `DB_ENGINE=sqlite` for zero-dependency instant execution.
* **Production / Docker**: Update `DB_ENGINE=postgresql` and provide your database credentials.

---

### 3. Backend Setup

1. **Activate Python Virtual Environment:**
   ```powershell
   .\backend\venv\Scripts\Activate.ps1
   ```
2. **Install Pinned Dependencies:**
   ```powershell
   pip install -r backend\requirements.txt
   ```
3. **Execute Database Migrations:**
   ```powershell
   python backend\manage.py migrate
   ```
4. **Run Backend Test Suite:**
   ```powershell
   python backend\manage.py test tests
   ```
   *(Executes 182 automated tests across all apps, security hardening, and E2E scenarios).*
5. **Start Development API Server:**
   ```powershell
   python backend\manage.py runserver 127.0.0.1:8000
   ```
   * Health Check: Inspect `http://127.0.0.1:8000/api/v1/health/`

---

### 4. Frontend Setup

1. **Install Node Dependencies:**
   ```powershell
   cd frontend
   npm install
   ```
2. **Run Automated Vitest Suite:**
   ```powershell
   npm test -- --run
   ```
   *(Executes 81 tests across 9 test suites in ~4 seconds).*
3. **Validate Production Bundle:**
   ```powershell
   npm run build
   ```
4. **Start Frontend Development Server:**
   ```powershell
   npm run dev
   ```
   * Access the application in your browser at `http://localhost:5173`.
   * Requests to `/api` are automatically proxied to the backend at `http://127.0.0.1:8000`.

---

### 5. Automated End-to-End Scenarios

Execute the complete end-to-end certification suite validating Scenarios A through G:
```powershell
python backend\manage.py test tests.test_e2e_scenarios
```

* **Scenario A**: Authentication and multi-role RBAC authorization boundaries.
* **Scenario B**: Student roster management, dynamic eligibility evaluation, and atomic duplicate rejection.
* **Scenario C**: Election scheduling, position configuration, and candidate nomination review.
* **Scenario D**: Dual-channel verification, OTP rate limiting, and challenge expiration handling.
* **Scenario E**: Voting fail-closed restriction enforcement (confirming real voting remains blocked).
* **Scenario F**: Real-time telemetry monitoring, heuristic anomaly alerting, and mandatory resolution notes.
* **Scenario G**: Results calculation, SHA-256 artifact digest verification, Separation of Duties, and publication gate rejection.

---

## Current Development Limitations & Governance Safeguards

1. **Independent Cryptographic Review Required**: While the application-level software boundary strictly separates voter participation from ballot storage, an independent cryptographic audit is mandatory prior to binding institutional usage.
2. **Real-Election Voting Gate Active**: Live voting is blocked by `FAIL_CLOSED_VOTING_RESTRICTION_ACTIVE = True`. No administrative override exists.
3. **Advisory AI Detection**: The machine learning anomaly engine generates investigative alerts only; it has zero authority to reject ballots or disenfranchise voters.
4. **Separation of Duties Enforced**: Election results cannot be approved or published by the same official who calculated the tallies.
5. **Local Concurrency Scope**: Concurrency has been validated on SQLite for development; high-concurrency race condition testing on PostgreSQL under 1,000+ simultaneous connections is planned for the staging environment.

For further technical specifications, consult the documents in the [`docs/`](docs/) directory:
* [Technical Architecture](docs/ARCHITECTURE.md)
* [Security Architecture & Threat Model](SECURITY.md)
* [Automated Testing Specification](docs/TESTING.md)
* [Production Deployment Guide](docs/DEPLOYMENT.md)
* [Operations Runbook](docs/OPERATIONS_RUNBOOK.md)
