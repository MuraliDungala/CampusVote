"""
QR Code Parsing, Generation and Validation Service for CampusVote.
Smart ID-Based College Voting System.
Supports structured JSON payloads, institutional signed tokens with timestamp expiration,
and normalized College ID barcode representations.
"""

import json
import hmac
import hashlib
import time
import re
import urllib.parse
from typing import Tuple, Dict, Any, Optional
from django.conf import settings
from apps.students.models import Student


def generate_signed_qr_payload(college_id: str, valid_seconds: int = 86400) -> str:
    """
    Generates a cryptographically signed institutional QR token.
    Contains college ID, unix timestamp, and HMAC-SHA256 signature.
    """
    normalized_id = college_id.strip().upper()
    now_ts = int(time.time())
    expiry_ts = now_ts + valid_seconds
    message = f"{normalized_id}:{expiry_ts}".encode('utf-8')
    secret = settings.SECRET_KEY.encode('utf-8')
    sig = hmac.new(secret, message, hashlib.sha256).hexdigest()
    return f"CAMPUSVOTE:{normalized_id}:{expiry_ts}:{sig}"


def parse_and_validate_qr_payload(raw_payload: str) -> Tuple[bool, Optional[str], str, Dict[str, Any]]:
    """
    Parses and validates a raw scanned QR payload.
    Supports:
      1. Signed institutional token: 'CAMPUSVOTE:<id>:<expiry_ts>:<sig>'
      2. Structured JSON payload: '{"college_id": "..."}' or '{"roll_no": "..."}'
      3. URL payloads: 'https://domain.edu/students/23341A4234' or '?id=23341A4234'
      4. Key-Value or labeled text: 'Roll No: 23341A4234', 'Student ID: 23341A4234'
      5. vCard and formatted credentials
      6. Slashes and compound roll formats: 'GMRIT/23341A4234'
      7. Plain institutional ID / Barcode string: '23341A4234', 'CS2026001', 'STU-2026-001'

    Returns:
      (is_valid: bool, college_id: Optional[str], message: str, metadata: dict)
    """
    if not raw_payload or not raw_payload.strip():
        return False, None, "QR code content is empty or unreadable.", {}

    cleaned = raw_payload.strip()

    # 1. Check for signed institutional token
    if cleaned.startswith("CAMPUSVOTE:"):
        parts = cleaned.split(":")
        if len(parts) == 4:
            prefix, token_id, expiry_str, sig = parts
            try:
                expiry_ts = int(expiry_str)
            except ValueError:
                return False, None, "Invalid timestamp in signed QR payload.", {}

            now_ts = int(time.time())
            if now_ts > expiry_ts:
                return False, None, "Signed institutional QR code has expired.", {"expired": True}

            # Verify cryptographic signature
            message = f"{token_id}:{expiry_ts}".encode('utf-8')
            secret = settings.SECRET_KEY.encode('utf-8')
            expected_sig = hmac.new(secret, message, hashlib.sha256).hexdigest()

            if not hmac.compare_digest(sig, expected_sig):
                return False, None, "Cryptographic signature on QR code is invalid or tampered.", {}

            normalized_id = token_id.strip().upper()
            return True, normalized_id, "Institutional signed QR code verified.", {"format": "signed_token"}

    # 2. Check for JSON structure
    if cleaned.startswith("{") and cleaned.endswith("}"):
        try:
            data = json.loads(cleaned)
            for key in ('college_id', 'id', 'student_id', 'roll_no', 'rollNo', 'roll_number', 'rollNumber', 'email'):
                if key in data and data[key]:
                    normalized_id = str(data[key]).strip().upper()
                    return True, normalized_id, f"Structured JSON payload recognized ({key}).", {"format": "json", **data}
        except json.JSONDecodeError:
            pass

    # 3. Check for URL structure (e.g. https://.../students/23341A4234 or ?id=23341A4234)
    if cleaned.startswith("http://") or cleaned.startswith("https://") or "://" in cleaned:
        try:
            parsed = urllib.parse.urlparse(cleaned)
            query_params = urllib.parse.parse_qs(parsed.query)
            for qkey in ('id', 'college_id', 'student_id', 'roll', 'roll_no', 'rollNo', 'roll_number', 'code'):
                if qkey in query_params and query_params[qkey]:
                    val = query_params[qkey][0].strip().upper()
                    if val:
                        return True, val, f"Student identifier extracted from URL ({qkey}).", {"format": "url_query", "raw_url": cleaned}

            # Check path segments (e.g. /students/23341A4234 or /verify/23341A4234)
            segments = [s.strip() for s in parsed.path.split('/') if s.strip()]
            for seg in reversed(segments):
                seg_clean = re.sub(r'[^A-Za-z0-9_-]', '', seg).upper()
                if len(seg_clean) >= 3 and any(c.isdigit() for c in seg_clean):
                    return True, seg_clean, "Student identifier extracted from URL path segment.", {"format": "url_path", "raw_url": cleaned}
        except Exception:
            pass

    # 4. Check for Key-Value or labeled text
    # e.g. "Roll No: 23341A4234", "ID: 23341A4234", "Student ID: 23341A4234"
    kv_match = re.search(r'(?:ID|Roll|Student\s*ID|College\s*ID|Reg|Regd|No|Number)[\s:=#-]+([A-Za-z0-9_-]{3,32})', cleaned, re.IGNORECASE)
    if kv_match:
        extracted = kv_match.group(1).strip().upper()
        return True, extracted, "Student identifier extracted from card label.", {"format": "labeled_text"}

    # 5. Check for vCard format
    if "VCARD" in cleaned.upper():
        note_match = re.search(r'NOTE:([^\r\n]+)', cleaned, re.IGNORECASE)
        if note_match:
            candidate = note_match.group(1).strip().upper()
            return True, candidate, "Student identifier extracted from vCard credential.", {"format": "vcard"}

    # 6. Slashes / Prefixes: e.g. "GMRIT/23341A4234"
    if '/' in cleaned:
        slash_parts = [p.strip() for p in cleaned.split('/') if p.strip()]
        for part in reversed(slash_parts):
            clean_part = re.sub(r'[^A-Za-z0-9_-]', '', part).upper()
            if len(clean_part) >= 3 and any(c.isdigit() for c in clean_part):
                return True, clean_part, "Student identifier extracted from formatted card code.", {"format": "slash_delimited"}

    # 7. Plain ID / Barcode fallback (e.g. barcode scan of student badge, roll number, or institutional email)
    clean_id = re.sub(r'\s+', '', cleaned)
    if 3 <= len(clean_id) <= 64 and all(c.isalnum() or c in '-_@.' for c in clean_id):
        normalized_id = clean_id.upper()
        return True, normalized_id, "Student identifier recognized from scan.", {"format": "plain_id"}

    return False, None, "Unsupported or unrecognized code format. Please ensure code is clear or enter ID manually.", {}


def lookup_student_for_qr(college_id: str) -> Tuple[bool, Optional[Student], str]:
    """
    Server-side lookup of student record for a validated QR/barcode ID.
    Supports College ID, institutional email, roll number prefix, and stripped institution prefixes.
    Enforces active enrollment checks.
    """
    raw_val = college_id.strip()
    student = Student.objects.filter(college_id__iexact=raw_val).first()

    if not student and '@' in raw_val:
        student = Student.objects.filter(email__iexact=raw_val.lower()).first()
        if not student:
            student = Student.objects.filter(user__email__iexact=raw_val.lower()).first()
        if not student:
            prefix = raw_val.split('@')[0].strip().upper()
            student = Student.objects.filter(college_id__iexact=prefix).first()

    # Try removing college prefixes (e.g. GMRIT-23341A4234 -> 23341A4234)
    if not student and '-' in raw_val:
        suffix = raw_val.split('-')[-1].strip().upper()
        if suffix:
            student = Student.objects.filter(college_id__iexact=suffix).first()

    if not student:
        return False, None, f"No student registry record found for '{raw_val}'."

    if not student.is_active:
        return False, None, "Student record is administratively deactivated."

    if student.enrollment_status in ('SUSPENDED', 'WITHDRAWN'):
        return False, None, f"Student enrollment status is '{student.get_enrollment_status_display()}'. Not eligible."

    return True, student, "Student record verified."
