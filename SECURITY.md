# CampusVote Security Architecture & Governance Policy

> **CRITICAL INSTITUTIONAL NOTICE**  
> **CampusVote is currently in Phase 9 (Automated Testing, Security Hardening, and Validation).**  
> In accordance with the system's foundational security constitution:
> 1. **Real-election voting is strictly disabled** by a fail-closed architectural gate (`FAIL_CLOSED_VOTING_RESTRICTION_ACTIVE = True`).
> 2. The anonymous-ballot protocol is an operational placeholder pending **independent cryptographic security audit and institutional certification**.
> 3. Passing automated application tests **does not constitute cryptographic certification or election-security accreditation**.
> 4. Real-election results **cannot be published** without verified multi-party approval, separation of duties, reconciliation verification, and institutional signing.

---

## 1. Security Philosophy & Threat Model

CampusVote is engineered to satisfy two fundamentally conflicting institutional requirements:
* **Accountability & Integrity**: Verifying that every voter is an active, eligible student, that each student casts at most one ballot, and that all ballot totals reconcile with participation counts.
* **Absolute Ballot Secrecy**: Ensuring that no database administrator, system log, timing attack, network trace, or compromised server can ever correlate an identified voter with their confidential candidate selections.

### Primary Threat Mitigations

| Threat | Target Surface | Architectural Mitigation |
| :--- | :--- | :--- |
| **Voter De-anonymization** | Ballot Storage & Logs | Complete separation between `VoterParticipationRecord` (Identity realm) and `AnonymousBallot` (Ballot Vault). Zero foreign keys to users/students exist in the ballot vault. |
| **Timing / Correlation Attacks** | Ingestion Pipeline | Anonymous ballots are recorded with hour-truncated timestamps (`YYYY-MM-DD HH:00:00`) and assigned non-sequential UUIDv4 primary keys. |
| **Double-Voting Race Conditions** | Ballot Submission | Concurrency-safe atomic transactions (`select_for_update`) verify voter participation state before issuing single-use, cryptographically random authorization tokens. |
| **QR Code Interception / Replay** | In-Person Polling Station | Ephemeral HMAC-SHA256 signed QR challenges with 60-second expiration nonces and device/session binding. |
| **Privilege Escalation** | Admin API Endpoints | Multi-tier Role-Based Access Control (`STUDENT`, `ELECTION_OFFICER`, `ELECTION_ADMIN`, `SYSTEM_AUDITOR`) enforced on the backend via DRF permissions. Inactive accounts are blocked globally by `IsActiveAccount`. |
| **Result Tampering** | Results Tabulation | Immutable result versions with SHA-256 cryptographic artifact digests. Any tampering with raw ballot records or tallies invalidates the digest. |
| **Unauthorized Result Publication** | Public Disclosure | Hardened multi-stage publication gate requiring distinct calculator and approver (Separation of Duties), `RECONCILED` status, and synthetic-only flags in test mode. |
| **Algorithm Disenfranchisement** | AI Anomaly Detection | Isolation Forest and deterministic heuristic detectors operate strictly in an **advisory** capacity. AI alerts can never automatically reject ballots, alter counts, or penalize students. |

---

## 2. Authentication & Authorization Architecture

### 2.1 Role-Based Access Control (RBAC)

The system defines four mutually exclusive institutional roles:
1. `STUDENT`: Read-only access to published election listings, candidate profiles, their own eligibility status, and their personal participation status.
2. `ELECTION_OFFICER`: Administrative privileges to schedule elections, configure positions, validate candidate nominations, monitor real-time aggregates, and calculate draft result versions.
3. `ELECTION_ADMIN`: All Officer permissions plus election lifecycle state transitions (Draft -> Scheduled -> Active -> Closed), approval of results calculated by Officers, and authorized publication.
4. `SYSTEM_AUDITOR`: Read-only access across all operational audit trails, anomaly alerts, security events, and result verification reports. Prohibited from mutating election states or approving results.

### 2.2 Account Lifecycle & Inactivity Enforcement

Every request undergoes authorization via the `IsActiveAccount` permission class:
* Deactivated accounts (`status = SUSPENDED` or `is_active = False`) are rejected with `403 Forbidden` across all endpoints, including read-only listings.
* User sessions and tokens cannot be reused once deactivated.

---

## 3. Verification & Identity Engine

To guarantee student authenticity prior to participation:
* **Dual-Channel Multi-Factor Verification**: Students initiate verification using their unique institutional College ID.
* **OTP Delivery**: Generates a 6-digit cryptographically secure numeric OTP with a 5-minute lifespan (`VERIFICATION_OTP_EXPIRY_SECONDS = 300`).
* **Rate Limiting & Lockout**:
  * Maximum 3 failed attempts per verification session (`VERIFICATION_MAX_ATTEMPTS = 3`).
  * Exceeding attempt limit locks the session for 15 minutes (`VERIFICATION_LOCKOUT_MINUTES = 15`).
  * Resend cooldown enforced at 60 seconds (`VERIFICATION_RESEND_COOLDOWN_SECONDS = 60`).
* **QR Nonce Verification**: QR verification validates cryptographic signatures against institutional shared secrets. Challenges expire after 60 seconds and reject reused or altered nonces.
* **Privacy in Delivery**: In development mode, `MockDeliveryProvider` captures codes in memory for automated testing. In production (`DEBUG=False`), `MockDeliveryProvider` is strictly disabled and raises `RuntimeError` unless an institutional SMTP/SMS provider is configured.

---

## 4. The Anonymous Ballot Boundary & Fail-Closed Gate

### 4.1 Architectural Decoupling

The voting domain is divided into two physically and logically separate schemas:

```
[ IDENTIFIED REALM ]                    [ ANONYMOUS VAULT ]
┌─────────────────────────┐             ┌─────────────────────────┐
│ Student / User Account  │             │   AnonymousBallot       │
├─────────────────────────┤             ├─────────────────────────┤
│ - college_id: 'CS2026'  │             │ - id: UUIDv4            │
│ - email: 'aarav@edu'    │             │ - election_id: UUIDv4   │
└────────────┬────────────┘             │ - position_id: UUIDv4   │
             │                          │ - candidate_id: UUIDv4  │
             ▼                          │ - created_at: Truncated │
┌─────────────────────────┐             │ (NO USER/STUDENT FK!)   │
│ VoterParticipationRecord│             └─────────────────────────┘
├─────────────────────────┤
│ - student_id: FK        │
│ - election_id: UUIDv4   │
│ - has_voted: True       │
│ - participated_at: Time │
└─────────────────────────┘
```

* **No Cross-Realm Keys**: `AnonymousBallot` has no foreign key to `User`, `Student`, or `VoterParticipationRecord`.
* **ZeroCHOICE Leakage**: Participation records contain only a boolean `has_voted` flag; they contain no reference to candidate selections or ballot UUIDs.

### 4.2 Non-Negotiable Fail-Closed Restriction

```python
FAIL_CLOSED_VOTING_RESTRICTION_ACTIVE = True
```
* **Status**: Binding institutional lock.
* **Behavior**: Any attempt to cast a live ballot in a non-synthetic election returns HTTP 403 / application exception with the notice:
  > *"Live election voting is disabled pending independent cryptographic security audit and institutional governance certification."*
* **Bypass Prevention**: No administrative role or endpoint can override this flag.

---

## 5. Advisory AI Anomaly Detection Governance

The Anomaly Detection Engine (utilizing `scikit-learn` Isolation Forest and deterministic heuristic rules) analyzes operational telemetry (submission velocity, off-hours clustering, IP concentration, user-agent anomalies).

### Institutional Protections:
1. **Advisory Only**: AI alerts are categorized as investigative signals (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
2. **Zero Automatic Action**: Anomaly alerts **never** invalidate cast ballots, alter vote counts, or disqualify student voters.
3. **Mandatory Resolution Notes**: Administrators cannot dismiss or resolve an alert without recording a substantive justification (`resolution_notes` min 10 characters).
4. **No Choice Exposure**: Telemetry evaluated by the anomaly engine contains aggregate timestamps and network metadata only; it never inspects ballot choices.

---

## 6. Results Verification & Publication Governance

Official election results are governed by strict institutional separation of duties:
1. **Deterministic Calculation**: Totals, percentages, and ties are computed deterministically.
2. **SHA-256 Artifact Digest**: Each result version generates a cryptographic digest over the serialized candidate tallies. Any database modification to tallies triggers an `INTEGRITY_COMPROMISED` alert.
3. **Separation of Duties**: The institutional official who initiates calculation **cannot** approve the result:
   ```
   result.calculated_by != approver_user  (Enforced by backend PermissionError)
   ```
4. **Reconciliation Gate**: If cast ballots do not equal recorded voter participation counts, the result is marked `RECONCILIATION_FAILED`. Such results cannot be approved or published.
5. **Synthetic Watermarking**: All test and demonstration results are permanently labeled with synthetic badges in both the API and UI.
6. **Public Endpoint Isolation**: The public results endpoint (`/api/v1/public/elections/<id>/results/`) returns `404 Not Found` for any election whose results are not officially published.

---

## 7. Secret Management & Hardening

* **Environment Separation**: All secrets (`DJANGO_SECRET_KEY`, `QR_HMAC_SECRET`, database passwords) must be provided via environment variables.
* **Fail-Safe Startup**: In production (`DEBUG=False`), the application immediately terminates startup if the default development secret key is detected.
* **Exclusion from VCS**: `.env` and `.pem` keys are ignored by `.gitignore`.
* **Sanitization in Logs**: Passwords, OTP codes, session tokens, JWTs, QR nonces, and candidate ballot choices are strictly scrubbed from all application logs and audit events.
* **HTTP Security Headers**: Enforced via `SecurityHeadersMiddleware`:
  * `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none';`
  * `X-Frame-Options: DENY`
  * `X-Content-Type-Options: nosniff`
  * `Referrer-Policy: strict-origin-when-cross-origin`
  * `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## 8. Reporting Security Vulnerabilities

We welcome responsible security disclosures. If you discover a vulnerability in CampusVote:
1. **Do not create a public GitHub issue.**
2. Email the institutional security team at: `security@campusvote.institution.edu`.
3. Include detailed steps to reproduce, affected endpoints, and potential impact.
4. Allow up to 48 hours for institutional security engineering acknowledgment before further coordination.
