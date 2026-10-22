# CampusVote Technical Architecture Specification

## 1. System Overview & Monorepo Topology

CampusVote is an enterprise collegiate election management and real-time voter turnout surveillance platform. It bridges strict institutional eligibility verification with provable voter ballot privacy.

```
vote/
├── backend/                       # Django 5+ & Django REST Framework (ASGI/Daphne)
│   ├── config/                    # Settings, ASGI routing, security middleware
│   ├── apps/
│   │   ├── accounts/              # User models, authentication, RBAC
│   │   ├── students/              # Student roster, CSV import with atomic preview
│   │   ├── elections/             # Election lifecycle, positions, candidate nominations
│   │   ├── eligibility/           # Rules engine & student criteria evaluation
│   │   ├── verification/          # Dual-channel OTP & HMAC-SHA256 QR nonces
│   │   ├── voting/                # Decoupled voter participation & anonymous ballot vault
│   │   ├── monitoring/            # Real-time WebSocket aggregates & turnout metrics
│   │   ├── anomaly/               # Isolation Forest & heuristic anomaly surveillance
│   │   ├── results/               # Deterministic tabulation, artifact digests, publication gates
│   │   └── audit/                 # Append-only audit trail with redaction filters
│   ├── tests/                     # 182 comprehensive unit, integration, and E2E tests
│   └── requirements.txt           # Pinned dependencies
├── frontend/                      # React 18+ (TypeScript), Vite, Tailwind CSS, Lucide
│   ├── src/
│   │   ├── components/            # Design system (Navy/Blue, cards, tables, modals)
│   │   ├── context/               # AuthContext & WebSocket connection state
│   │   ├── pages/                 # Role-segmented routing (Public, Student, Admin)
│   │   ├── services/              # Type-safe Axios API client
│   │   └── tests/                 # 81 Vitest unit & integration test cases
│   ├── package.json
│   └── vite.config.ts
├── docs/                          # Architectural, operational, and security specifications
├── docker-compose.yml             # PostgreSQL 15 & Redis 7.2 services
├── .env.example                   # Sanitized environment configuration template
└── README.md
```

---

## 2. Component Layout & Module Boundaries

```mermaid
graph TD
    Client[React/TypeScript Frontend SPA] -->|HTTPS REST API| DRF[Django REST Framework API Gateway]
    Client -->|WSS WebSockets| Channels[Django Channels / Daphne ASGI]

    subgraph Backend Core
        DRF --> Auth[apps.accounts: RBAC & Auth]
        DRF --> Students[apps.students: Registry & Ingestion]
        DRF --> Eligibility[apps.eligibility: Rules Engine]
        DRF --> Verification[apps.verification: OTP & QR Nonces]
        DRF --> Elections[apps.elections: Lifecycle & Nominations]
        DRF --> Voting[apps.voting: Participation & Ballot Vault]
        DRF --> Anomaly[apps.anomaly: Surveillance & Isolation Forest]
        DRF --> Results[apps.results: Tabulation & Publication Gates]
        DRF --> Audit[apps.audit: Tamper-Evident Logs]
    end

    Channels --> Monitoring[apps.monitoring: Turnout Aggregation]
    Monitoring --> Redis[(Redis Channel Layer)]
    Voting --> DB[(PostgreSQL / SQLite ACID Storage)]
    Audit --> DB
```

---

## 3. Data Flows & Process Lifecycles

### 3.1 Authentication & Role-Based Access Control Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Student / Official
    participant Client as React SPA
    participant Auth as apps.accounts
    participant DB as Database

    User->>Client: Enter Credentials / College ID
    Client->>Auth: POST /api/v1/auth/login/
    Auth->>DB: Query User & Check Password / Inactivity
    alt Account Inactive / Suspended
        Auth-->>Client: 403 Forbidden (Account Suspended)
    else Invalid Credentials
        Auth-->>Client: 401 Unauthorized
    else Authentication Successful
        Auth-->>Client: 200 OK + Session Token + Role
        Note over Client: Stores Auth State in Context<br/>Routes by Role (STUDENT / ADMIN)
    end
```

### 3.2 Student Eligibility Evaluation Flow

The eligibility engine evaluates student attributes against composite election rules:

```mermaid
flowchart TD
    Start([Evaluate Student Eligibility]) --> R1{Enrolled & Active?}
    R1 -- No --> Ineligible[Result: INELIGIBLE]
    R1 -- Yes --> R2{Explicit Whitelist Override?}
    R2 -- Yes --> Eligible[Result: ELIGIBLE]
    R2 -- No --> R3{Department Allowed?}
    R3 -- No --> Ineligible
    R3 -- Yes --> R4{Year of Study Allowed?}
    R4 -- No --> Ineligible
    R4 -- Yes --> R5{Min CGPA Satisfied?}
    R5 -- No --> Ineligible
    R5 -- Yes --> Eligible
```

### 3.3 Election Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Created by Admin/Officer
    DRAFT --> SCHEDULED: Scheduled with Valid Timeframes
    SCHEDULED --> ACTIVE: Start Time Reached
    ACTIVE --> PAUSED: Emergency Pause by Admin
    PAUSED --> ACTIVE: Resumed by Admin
    ACTIVE --> CLOSED: End Time Reached / Closed by Admin
    CLOSED --> PUBLISHED: Results Calculated, Approved & Published
    PUBLISHED --> [*]
```

### 3.4 Voting & Ballot Anonymity Boundary

The core privacy firewall guarantees that no correlation exists between who voted and what was cast:

```mermaid
sequenceDiagram
    autonumber
    actor Voter as Verified Student
    participant Voting as apps.voting
    participant PartRec as VoterParticipationRecord
    participant TokenGen as Ephemeral Token Dispenser
    participant Vault as AnonymousBallot Vault

    Voter->>Voting: Request Ballot for Active Election
    Voting->>PartRec: Check has_voted (select_for_update)
    alt Already Voted
        Voting-->>Voter: 400 Bad Request (Already Participated)
    else First-time Participation
        Voting->>PartRec: Insert Record (has_voted=True, student_id=FK)
        Voting->>TokenGen: Generate Single-Use Cryptographic Nonce
        Voting-->>Voter: Return Ballot Schema + Ephemeral Token
    end

    Voter->>Vault: POST /api/v1/voting/ballots/submit/<br/>(Candidate Selections + Ephemeral Token)
    Note over Vault: Fail-Closed Gate Checks:<br/>If Live Election -> BLOCKED (Phase 5/9 Restriction)
    Vault->>TokenGen: Validate & Mark Token CONSUMED
    Vault->>Vault: Write AnonymousBallot<br/>- UUIDv4 Primary Key<br/>- Hour-Truncated Timestamp<br/>- NO Student FK / NO IP / NO User-Agent
    Vault-->>Voter: 201 Created (Anonymous Vote Confirmation)
```

---

## 4. Real-Time Turnout & Advisory Anomaly Detection Architecture

### 4.1 Turnout Aggregation & Privacy Suppression
* **WebSocket Streams**: Handled via `TurnoutConsumer` in Django Channels at `/ws/turnout/<election_id>/`.
* **Differential Privacy Filter**: To protect voter privacy in small cohorts, departments with fewer than `DEPARTMENT_PRIVACY_THRESHOLD = 5` enrolled voters have turnout counts suppressed or aggregated into "Other".
* **Zero Ballot Choice Exposure**: Analytics pipelines receive only count increments, timestamps, and department buckets. Candidate choices are never broadcast over WebSockets.

### 4.2 Advisory Anomaly Surveillance Pipeline
* **Telemetry Gatherer**: Samples submission time intervals, IP prefixes, and device user-agents.
* **Detector Suite**:
  1. *Velocity Burst Detector*: Identifies rapid bursts from identical subnet ranges.
  2. *Off-Hours Spike Detector*: Flags voting volume outside expected polling station operational hours.
  3. *Unsupervised Isolation Forest*: Evaluates multi-dimensional clustering over feature matrices.
* **Explainability & Resolution**: Every alert contains detailed heuristic evidence (`evidence_payload`). Dismissing or resolving alerts strictly requires authorized administrator notes.

---

## 5. Results Verification & Publication Workflow

```mermaid
stateDiagram-v2
    [*] --> DRAFT_CALCULATION: Triggered by Election Officer
    DRAFT_CALCULATION --> RECONCILED: Ballots match Participation count
    DRAFT_CALCULATION --> RECONCILIATION_FAILED: Ballots != Participation count
    RECONCILED --> PENDING_APPROVAL: SHA-256 Digest Computed
    PENDING_APPROVAL --> APPROVED: Approved by Distinct Admin (Separation of Duties)
    PENDING_APPROVAL --> REJECTED: Rejected with Reason
    APPROVED --> PUBLISHED: Published by Authorized Admin
    PUBLISHED --> [*]
```

### Result Artifact Digest Calculation
The cryptographic digest ensures tamper detection across result versions:
$$\text{Digest} = \text{SHA-256}\left(\text{election\_id} \parallel \text{version\_number} \parallel \text{sorted\_candidate\_tallies} \parallel \text{reconciliation\_status}\right)$$
Any direct alteration to candidate tallies in the database breaks digest validation, resulting in `INTEGRITY_COMPROMISED`.

---

## 6. Development vs. Production Dependencies

| Component | Development Environment | Production Target |
| :--- | :--- | :--- |
| **Database** | SQLite 3 (zero configuration) | PostgreSQL 15+ with row-level locking |
| **Channel Layer** | InMemoryChannelLayer | Redis 7.2 Cluster |
| **Verification** | `MockDeliveryProvider` (in-memory) | Institutional SMTP / SMS Gateway |
| **ASGI Server** | Daphne dev server / `manage.py runserver` | Multi-worker Daphne / Gunicorn behind NGINX |
| **Static Assets** | Vite HMR (`127.0.0.1:5173`) | Precompiled static assets via WhiteNoise / CDN |
| **TLS / SSL** | Plain HTTP (localhost) | Strict HTTPS with HSTS Preload |
