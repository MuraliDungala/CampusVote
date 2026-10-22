"""
Secure CSV Roster Parser and Row-Level Validator.
CampusVote Student Management Architecture.
Protects against CSV formula injection, memory exhaustion, and invalid data structures.
"""

import csv
import io
import re
from typing import Dict, Any, List, Tuple
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from apps.students.models import Student, INSTITUTIONAL_DEPARTMENTS

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 Megabytes
EXPECTED_COLUMNS = ['college_id', 'full_name', 'email', 'department', 'academic_year', 'course']


def sanitize_csv_cell(value: str) -> str:
    """
    Prevents CSV formula injection vulnerabilities.
    If a cell begins with '=', '+', '-', '@', tab, or carriage return,
    it is prepended with a single quote so spreadsheet engines treat it as plain text.
    """
    if not value:
        return ''
    value = str(value).strip()
    if value and value[0] in ('=', '+', '-', '@', '\t', '\r'):
        return f"'{value}"
    return value


def parse_and_validate_roster_csv(file_obj) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Parses an uploaded CSV file, validates rows against registrar rules,
    and classifies each row into VALID, INVALID, DUPLICATE_IN_FILE,
    EXISTING_IDENTICAL, or EXISTING_CONFLICT.
    """
    # 1. File size validation
    file_obj.seek(0, io.SEEK_END)
    file_size = file_obj.tell()
    file_obj.seek(0)

    if file_size > MAX_FILE_SIZE_BYTES:
        raise ValidationError(f"File size exceeds maximum permitted limit of {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.")

    if file_size == 0:
        raise ValidationError("The uploaded CSV file is empty.")

    # 2. Decode content with fallback encodings
    raw_bytes = file_obj.read()
    decoded_text = None
    for encoding in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
        try:
            decoded_text = raw_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if decoded_text is None:
        raise ValidationError("Unable to decode CSV file. Please ensure the file is saved in standard UTF-8 format.")

    # 3. CSV parsing
    stream = io.StringIO(decoded_text, newline=None)
    # Sniff dialect or fallback to standard comma
    try:
        sample = decoded_text[:2048]
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
    except Exception:
        dialect = csv.excel

    reader = csv.reader(stream, dialect=dialect)

    try:
        raw_headers = next(reader)
    except StopIteration:
        raise ValidationError("CSV file contains no header row.")

    # Normalize header names (lowercase, stripped, remove quotes and spaces)
    normalized_headers = [re.sub(r'[^a-z0-9_]', '', h.strip().lower()) for h in raw_headers]

    # Validate required headers
    missing_headers = [col for col in EXPECTED_COLUMNS if col not in normalized_headers]
    if missing_headers:
        raise ValidationError(
            f"CSV file is missing required columns: {', '.join(missing_headers)}. "
            f"Expected headers: {', '.join(EXPECTED_COLUMNS)}."
        )

    header_indices = {col: normalized_headers.index(col) for col in EXPECTED_COLUMNS}

    # Fetch existing students from database for duplicate/conflict detection
    existing_students = {
        s.college_id.strip().upper(): s
        for s in Student.objects.all()
    }
    existing_emails = {
        s.email.strip().lower(): s.college_id
        for s in Student.objects.filter(email__isnull=False).exclude(email='')
    }

    seen_college_ids_in_file = set()
    seen_emails_in_file = set()

    rows_data: List[Dict[str, Any]] = []
    valid_count = 0
    invalid_count = 0
    duplicate_count = 0
    conflict_count = 0
    identical_count = 0

    for row_idx, raw_row in enumerate(reader, start=2):  # start=2 considering header is line 1
        if not raw_row or all(not cell.strip() for cell in raw_row):
            continue  # skip completely blank lines

        # Extract values safely
        college_id_raw = raw_row[header_indices['college_id']] if header_indices['college_id'] < len(raw_row) else ''
        full_name_raw = raw_row[header_indices['full_name']] if header_indices['full_name'] < len(raw_row) else ''
        email_raw = raw_row[header_indices['email']] if header_indices['email'] < len(raw_row) else ''
        department_raw = raw_row[header_indices['department']] if header_indices['department'] < len(raw_row) else ''
        academic_year_raw = raw_row[header_indices['academic_year']] if header_indices['academic_year'] < len(raw_row) else ''
        course_raw = raw_row[header_indices['course']] if header_indices['course'] < len(raw_row) else ''

        college_id = sanitize_csv_cell(college_id_raw).strip().upper()
        full_name = sanitize_csv_cell(full_name_raw).strip()
        email = sanitize_csv_cell(email_raw).strip().lower()
        department = sanitize_csv_cell(department_raw).strip()
        academic_year_str = sanitize_csv_cell(academic_year_raw).strip()
        course = sanitize_csv_cell(course_raw).strip()

        row_errors: List[str] = []
        row_diff: Dict[str, Any] = {}
        status = 'VALID'

        # Field-level validations
        if not college_id:
            row_errors.append("College ID is required.")
        elif not re.match(r'^[A-Z0-9\-_]{3,64}$', college_id):
            row_errors.append("College ID must be 3-64 characters (letters, numbers, dashes, underscores).")

        if not full_name:
            row_errors.append("Student full name is required.")

        if not email:
            row_errors.append("Email address is required.")
        else:
            try:
                validate_email(email)
            except ValidationError:
                row_errors.append(f"Invalid email address format: '{email}'.")

        if not department:
            row_errors.append("Academic department is required.")

        academic_year_int = None
        if not academic_year_str:
            row_errors.append("Academic year is required.")
        else:
            try:
                academic_year_int = int(academic_year_str)
                if not (1 <= academic_year_int <= 5):
                    row_errors.append(f"Academic year must be between 1 and 5 (got {academic_year_int}).")
            except ValueError:
                row_errors.append(f"Academic year must be an integer (got '{academic_year_str}').")

        # Duplicate in file checks
        if college_id in seen_college_ids_in_file:
            status = 'DUPLICATE'
            row_errors.append(f"Duplicate College ID '{college_id}' found multiple times within this CSV file.")
        elif email and email in seen_emails_in_file:
            status = 'DUPLICATE'
            row_errors.append(f"Duplicate email '{email}' found multiple times within this CSV file.")

        if college_id:
            seen_college_ids_in_file.add(college_id)
        if email:
            seen_emails_in_file.add(email)

        # Database collision checks if not already invalid or duplicate
        if not row_errors and status == 'VALID':
            if college_id in existing_students:
                existing = existing_students[college_id]
                # Check for field diffs
                diffs = {}
                if existing.full_name != full_name:
                    diffs['full_name'] = {'old': existing.full_name, 'new': full_name}
                if existing.email != email:
                    diffs['email'] = {'old': existing.email, 'new': email}
                if existing.department != department:
                    diffs['department'] = {'old': existing.department, 'new': department}
                if existing.academic_year != academic_year_int:
                    diffs['academic_year'] = {'old': existing.academic_year, 'new': academic_year_int}
                if existing.course != course:
                    diffs['course'] = {'old': existing.course, 'new': course}

                if diffs:
                    status = 'CONFLICT'
                    row_diff = diffs
                    conflict_count += 1
                else:
                    status = 'IDENTICAL'
                    identical_count += 1
            elif email in existing_emails and existing_emails[email] != college_id:
                status = 'CONFLICT'
                row_errors.append(f"Email '{email}' is already registered to a different student ({existing_emails[email]}).")
                conflict_count += 1

        if status == 'DUPLICATE':
            duplicate_count += 1
        elif row_errors:
            status = 'INVALID'
            invalid_count += 1
        elif status == 'VALID':
            valid_count += 1

        rows_data.append({
            'row_number': row_idx,
            'college_id': college_id,
            'full_name': full_name,
            'email': email,
            'department': department,
            'academic_year': academic_year_int,
            'course': course,
            'status': status,
            'errors': row_errors,
            'diff': row_diff
        })

    summary = {
        'total_rows': len(rows_data),
        'valid_rows': valid_count,
        'invalid_rows': invalid_count,
        'duplicate_rows': duplicate_count,
        'conflict_rows': conflict_count,
        'identical_rows': identical_count,
        'is_importable': valid_count > 0 and invalid_count == 0 and duplicate_count == 0
    }

    return summary, rows_data
