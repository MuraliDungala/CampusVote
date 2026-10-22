# CampusVote Security Architecture & Design Decisions

## 1. Core Security Tenet
> **No database entry, system log, HTTP request trace, or operational event shall ever correlate an authenticated student's identity with their cast ballot selections.**

## 2. Architectural Privacy Decoupling

### Identity Domain vs. Anonymous Ballot Vault
Traditional relational databases link users to actions using foreign keys (`user_id` on the `Ballot` table). In CampusVote, this pattern is strictly prohibited. The system enforces an architectural firewall between two distinct database realms:

1. **Identity & Eligibility Realm**:
   * Tracks *who* is registered (`Student`).
   * Tracks *who* has cast a vote (`VoterParticipationRecord`: `has_voted: bool`).
   * Ensures one vote per student.
2. **Anonymous Ballot Vault**:
   * Stores *what* choices were cast (`AnonymousBallot`).
   * Contains **no foreign key** to the student.
   * Contains **no IP address** or **User-Agent**.
   * Uses non-sequential UUIDv4 primary keys to prevent sequence reconstruction.

### Token Dispensing Protocol
* When a student requests a ballot, their eligibility is validated.
* The system atomically flags the student as `has_voted = True` within a database transaction.
* An ephemeral, cryptographically random single-use ballot authorization token is issued.
* The voter's client submits the anonymous ballot payload with this token to the Ballot Vault.
* The Ballot Vault validates that the token is valid, marks it `CONSUMED`, and stores the anonymous ballot without any metadata linking it back to the student.

## 3. Threat Model & Mitigations

### 3.1 Timing & Sequence Attacks
* **Threat**: An adversary with read access to the database compares the timestamp of `VoterParticipationRecord` (`10:14:02.123`) with the timestamp of `AnonymousBallot` (`10:14:02.125`) to link the voter with their vote.
* **Mitigations**:
  * Ballots are queued through an asynchronous buffer with random micro-delays (jitter).
  * Timestamps on `AnonymousBallot` records are truncated to hourly buckets (`2026-10-19 10:00:00`).
  * Non-sequential primary keys (UUIDv4) eliminate insertion-order inference.

### 3.2 Double-Voting Race Conditions
* **Threat**: A compromised or concurrent client submits simultaneous voting requests.
* **Mitigation**: Database-level atomic locks (`SELECT ... FOR UPDATE`) in `SERIALIZABLE` or `REPEATABLE READ` transaction isolation ensure that authorization tokens cannot be consumed concurrently.

### 3.3 Replay Attacks on QR Verification
* **Threat**: A voter photographs an in-person terminal QR code and shares it with remote peers.
* **Mitigation**: QR codes encode an HMAC signature containing a session identifier and an ephemeral nonce that expires within 60 seconds.

### 3.4 Advisory Role of AI Anomaly Detection
* **Threat**: An anomaly detection algorithm (e.g. `scikit-learn` IsolationForest) produces false positives, disenfranchising eligible voters by rejecting their ballots or revoking access.
* **Architectural Constraint**: AI models have **zero write access** to student eligibility or ballot state. The AI engine only appends advisory risk scores to `SecurityEvent` audit logs for human administrative review. It can never reject a vote.

### 3.5 Cryptographic Voting Protocol Policy
* **Decision**: CampusVote **does not invent custom cryptographic voting algorithms**.
* While software-enforced token decoupling provides strong practical privacy for campus elections, deploying an End-to-End Verifiable (E2E-V) cryptographic voting protocol (such as Paillier homomorphic encryption or verifiable mixnets like Helios/ElectionGuard) requires independent cryptographic review and institutional certification prior to binding institutional elections.

## 4. Phase 0 Security Posture
* No real student credentials, passwords, or PII are stored.
* All development uses synthetic placeholder data.
* Routes marked `/student/dashboard` and `/admin/dashboard` are labeled as development placeholders without false claims of security enforcement.
* CORS headers are restricted to `http://localhost:5173` and `http://127.0.0.1:5173`.
* Secrets are strictly managed via environment variables and excluded from Git version control.
