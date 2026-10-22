# CampusVote Automated Testing & Verification Guide

This document details the test suites, execution commands, fixture architecture, and test coverage across backend, frontend, and end-to-end integration environments.

---

## 1. Test Suite Overview & Metrics

CampusVote employs automated multi-layer testing:
* **Backend Suite (Django & DRF)**: **182 automated tests** executing across all 9 application domains (Accounts, Students, Eligibility, Elections, Verification, Voting, Monitoring, Anomaly, Results, Audit) plus Phase 9 Security Hardening and E2E Scenarios A–G.
* **Frontend Suite (Vitest & Testing Library)**: **81 automated tests** across 9 test suites validating UI components, role navigation, form validation, error boundaries, monitoring charts, and security gates.
* **Production Build Validation**: Clean compilation via `tsc -b && vite build` with zero TypeScript errors.

---

## 2. Backend Automated Testing

### 2.1 Complete Test Run
Execute all backend tests using the project virtual environment:
```powershell
.\backend\venv\Scripts\python.exe backend/manage.py test tests
```
*Expected Execution Time*: ~75–85 seconds.  
*Pass Rate*: 182 / 182 (100% Passing).

### 2.2 Targeted Test Execution by Domain

| Test Target | File / Module | Command | Coverage Focus |
| :--- | :--- | :--- | :--- |
| **Phase 9 E2E Scenarios** | `tests.test_e2e_scenarios` | `python backend/manage.py test tests.test_e2e_scenarios` | Scenarios A–G: RBAC, Students, Elections, Verification, Fail-closed voting, Anomalies, Results. |
| **Phase 9 Security Hardening** | `tests.test_security_hardening_phase9` | `python backend/manage.py test tests.test_security_hardening_phase9` | OWASP headers, inactive account lockouts, zero ballot-student linkage, separation of duties, digest verification. |
| **Results & Governance** | `tests.test_results_phase8` | `python backend/manage.py test tests.test_results_phase8` | Calculation, ties, artifact digests, multi-stage approval, synthetic badges. |
| **AI Anomaly Detection** | `tests.test_anomaly_phase7` | `python backend/manage.py test tests.test_anomaly_phase7` | Isolation Forest, velocity detectors, mandatory resolution notes. |
| **Monitoring & WebSockets** | `tests.test_monitoring_phase6` | `python backend/manage.py test tests.test_monitoring_phase6` | Real-time aggregate counters, privacy suppression thresholds, WebSocket permissions. |
| **Voting & Ballot Vault** | `tests.test_voting_phase5` | `python backend/manage.py test tests.test_voting_phase5` | Fail-closed voting restriction, double voting prevention, decoupled token issuer. |
| **Verification & OTP** | `tests.test_verification_phase4` | `python backend/manage.py test tests.test_verification_phase4` | Dual-channel OTP, 60s QR HMAC nonces, lockout policies, MockDeliveryProvider. |
| **Elections & Candidates** | `tests.test_elections_phase3` | `python backend/manage.py test tests.test_elections_phase3` | Lifecycle transitions, position creation, candidate nominations. |
| **Eligibility Engine** | `tests.test_eligibility_phase2` | `python backend/manage.py test tests.test_eligibility_phase2` | Multi-criteria evaluation, department/year rules, whitelist overrides. |
| **Accounts & RBAC** | `tests.test_accounts_phase1` | `python backend/manage.py test tests.test_accounts_phase1` | Multi-role permissions, JWT authentication, session expiration. |

---

## 3. Frontend Automated Testing

### 3.1 Running Vitest Suites
Run the entire frontend test suite in non-interactive single-run mode:
```powershell
cd frontend
npm test -- --run
```
*Expected Execution Time*: ~4.0 seconds.  
*Pass Rate*: 81 / 81 across 9 test files (100% Passing).

### 3.2 Frontend Test File Breakdown

| Test File | Test Count | Domain Validated |
| :--- | :--- | :--- |
| `src/tests/SecurityHardeningPhase9.test.tsx` | 5 | RBAC route rejection, unauthenticated redirect, decoupled voting notice, public 404, anomaly resolution modal notes. |
| `src/tests/ElectionResults.test.tsx` | 8 | Results dashboard, reconciliation statuses, digest verification, synthetic badges, public results view. |
| `src/tests/ElectionSecurityMonitor.test.tsx` | 11 | Anomaly dashboard, severity filters, alert lifecycle, resolution modal, zero choice exposure. |
| `src/tests/ElectionMonitoring.test.tsx` | 8 | Real-time charts, WebSocket connection lifecycle, department privacy suppression. |
| `src/tests/BallotVoting.test.tsx` | 13 | Candidate selection cards, fail-closed restriction notices, review modals, submission confirmation. |
| `src/tests/VerificationManagement.test.tsx` | 11 | Smart ID input, OTP entry countdowns, QR camera placeholder, attempt limit counters. |
| `src/tests/ElectionManagement.test.tsx` | 10 | Election list, creation wizard, positions editor, nomination review, status transition pills. |
| `src/tests/StudentManagement.test.tsx` | 8 | Student roster table, eligibility badge rendering, CSV upload modal, atomic preview. |
| `src/App.test.tsx` | 7 | Design system tokens, navigation header, footer, 404/403 route error boundaries. |

### 3.3 Production Build Verification
Verify type correctness and production asset bundling:
```powershell
cd frontend
npm run build
```
*Command Executed*: `tsc -b && vite build`  
*Outcome*: Successful build in ~3.0s, generating optimized production bundles in `frontend/dist/`.

---

## 4. End-to-End Scenarios Matrix (Scenarios A through G)

Automated in `backend/tests/test_e2e_scenarios.py`:

| Scenario | Objective | Verification Outcome |
| :--- | :--- | :--- |
| **Scenario A** | Authentication & Role Isolation | **PASSED**: Validates student login, verifies denial of administrative endpoints, verifies unauthenticated request rejection. |
| **Scenario B** | Student & Eligibility Management | **PASSED**: Creates student record, validates dynamic eligibility rules, rejects duplicate College IDs atomically. |
| **Scenario C** | Election Administration | **PASSED**: Creates election, schedules positions, submits candidate nomination, reviews nomination, validates lifecycle state changes. |
| **Scenario D** | Dual-Channel Verification | **PASSED**: Dispatches synthetic OTP, rejects incorrect codes, verifies successful code, validates expired challenge handling. |
| **Scenario E** | Voting Fail-Closed Behavior | **PASSED**: Verifies that live election voting remains strictly blocked by the fail-closed gate. Rejects ballot submission for non-synthetic elections. |
| **Scenario F** | Monitoring & Anomaly Surveillance | **PASSED**: Ingests telemetry, triggers heuristic anomaly alert, tests acknowledgement and mandatory resolution notes. |
| **Scenario G** | Results Governance & Separation of Duties | **PASSED**: Computes synthetic results, checks SHA-256 digest, rejects self-approval by calculator, blocks unapproved publication, isolates public endpoint. |

---

## 5. Test Data Fixtures & Isolation

* **Database Isolation**: The Django test runner instantiates an isolated in-memory or temporary SQLite test database (`test_default`), destroyed upon test suite completion.
* **Mock Delivery Provider**: All email and SMS OTP dispatches are routed to `MockDeliveryProvider` in memory (`ALLOW_MOCK_DELIVERY_IN_TESTS=True`). No live network calls or external SMS/email costs are incurred.
* **Component Test Isolation**: Frontend tests mock Axios API responses to test UI state machines without coupling to a live backend. Real integration is tested via end-to-end tests and backend client assertions.

---

## 6. Known Untested Areas & External Limitations

1. **High-Concurrency PostgreSQL Race Testing**:
   * Automated tests currently execute against SQLite in development.
   * While SQLite verifies all transactional logic, true multi-worker row-level lock contention under 1,000+ concurrent requests requires a deployed PostgreSQL 15 instance.
2. **Independent Cryptographic Audit**:
   * Application-level tests confirm software decoupling between participation and ballots.
   * This does **not** substitute for an independent academic or professional cryptographic security evaluation of the voting protocol.
3. **Physical QR Scanner Hardware**:
   * In-person hardware camera stream decoding is simulated in the browser and API levels.
