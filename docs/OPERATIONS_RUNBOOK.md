# CampusVote Operations & Incident Response Runbook

This runbook provides standardized operational procedures for system administrators, DevOps engineers, and election officers operating CampusVote.

---

## 1. Routine Operational Procedures

### 1.1 System Startup (Development / Staging)
1. **Activate Python Virtual Environment & Start Backend:**
   ```powershell
   .\backend\venv\Scripts\Activate.ps1
   python backend\manage.py runserver 127.0.0.1:8000
   ```
2. **Start Frontend Development Server:**
   ```powershell
   cd frontend
   npm run dev
   ```
3. **Verify Health Endpoint:**
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/health/"
   ```
   *Expected Response*: `{"status": "healthy", "service": "campusvote-backend", "database": "connected"}`

### 1.2 Graceful System Shutdown
1. Broadcast maintenance notification to active administrative sessions if possible.
2. Terminate the ASGI/Daphne process gracefully (`SIGTERM` allows in-flight HTTP and WebSocket connections to drain).
3. Confirm database connections are drained before stopping PostgreSQL or Redis.

---

## 2. Health-Check Verification & Diagnostics

### 2.1 Automated Endpoints
* **API Health Check**: `GET /api/v1/health/`
  * Checks database connectivity.
  * Checks Redis / Channel layer responsiveness.
  * Returns HTTP 200 on healthy; HTTP 503 on service degradation.

### 2.2 Operational Audit Trail Review
* Auditors and administrators can review real-time security events at `/api/v1/audit/logs/` or via Django Admin (`/admin/audit/auditlog/`).
* Audit logs are strictly append-only; entries record action name, actor IP address, timestamp, and sanitized metadata (passwords, tokens, and candidate choices are redacted).

---

## 3. Database Migration Procedures

1. **Verify No Schema Divergence:**
   ```powershell
   python backend\manage.py makemigrations --check
   ```
2. **Review Pending Migrations:**
   ```powershell
   python backend\manage.py showmigrations
   ```
3. **Execute Migrations:**
   ```powershell
   python backend\manage.py migrate
   ```
4. **Post-Migration Verification:**
   Execute system checks to confirm constraints and foreign keys:
   ```powershell
   python backend\manage.py check
   ```

---

## 4. Incident Response & Failure Diagnosis

### 4.1 Diagnosis Matrix

| Symptom | Probable Cause | Immediate Remediation |
| :--- | :--- | :--- |
| **HTTP 500 on Login / API Calls** | Database unreachable or locked | Verify PostgreSQL/SQLite service status. Check backend logs for lock timeouts. |
| **WebSocket Connection Drops** | Redis channel layer unavailable or exhausted | Verify Redis container (`docker-compose ps`). Check Daphne worker logs. |
| **High Frequency of Anomaly Alerts** | Network subnet burst or misconfigured clock | Inspect `/api/v1/anomaly/alerts/`. Review evidence payload for common IPs or device fingerprints. |
| **Integrity Compromise Alert on Results** | Ballots altered post-calculation or corrupted version | Immediately pause election. Check SHA-256 artifact digest against recalculation tally. |
| **Student Locked Out of Verification** | 3 failed OTP attempts | Session locked for 15 minutes. Student must wait for cooldown or an authorized Election Officer can verify physical ID at polling desk. |

### 4.2 Emergency Election Pause Protocol
In the event of an active cyber incident, power loss at polling terminals, or critical anomaly:
1. Navigate to Election Administration dashboard or invoke API:
   ```http
   POST /api/v1/elections/<id>/pause/
   Authorization: Bearer <ADMIN_TOKEN>
   ```
2. Transitioning state to `PAUSED` immediately suspends ballot submission across all terminals while preserving all cast ballots.
3. Once the anomaly is investigated and resolved by an Election Admin, resume via:
   ```http
   POST /api/v1/elections/<id>/resume/
   ```

---

## 5. Result Publication Governance & Verification Checklist

Before publishing results to the public portal (`/api/v1/public/elections/<id>/results/`), the following sequence must be satisfied:

```
[ Step 1: Calculate Draft ]  --> Triggered by Election Officer
            │
            ▼
[ Step 2: Digest Check ]     --> SHA-256 artifact digest verified against tallies
            │
            ▼
[ Step 3: Reconciliation ]   --> Cast Ballots == Voter Participation Count
            │
            ▼
[ Step 4: Separation Gate ]  --> Approving Admin != Calculating Officer
            │
            ▼
[ Step 5: Official Publish ] --> Public endpoint active; synthetic watermark verified
```

### Mandatory Publication Criteria
1. Election lifecycle status must be `CLOSED`.
2. Total cast ballots must reconcile with voter participation logs (`RECONCILED`).
3. Candidate tallies must pass SHA-256 artifact digest verification (`INTEGRITY_VERIFIED`).
4. Approving administrator cannot be the user who calculated the result version (Separation of Duties).
5. If running in a test or demonstration context, the `is_synthetic` flag must be set to `True` so public viewers are notified of demonstration status.

---

## 6. Escalation & Contact Guidance

* **Security Incident Escalation**: Immediate escalation to Institutional Information Security Officer (`security@campusvote.institution.edu`).
* **Governance & Legal Inquiries**: Campus Electoral Oversight Committee (`elections-board@campusvote.institution.edu`).
* **Infrastructure Support**: Campus Systems Engineering Team (`devops@campusvote.institution.edu`).
