"""
Eligibility Evaluation Engine Service.
Evaluates student voter eligibility purely on the backend.
Guarantees students cannot elevate or grant eligibility to themselves.
"""

from typing import Tuple, Dict, Any
from django.db.models import QuerySet, Q
from apps.students.models import Student
from apps.eligibility.models import ElectionEligibilityRule


class EligibilityEngineService:
    """Core service for computing voter qualification against election criteria."""

    @staticmethod
    def evaluate_student(student: Student, rule: ElectionEligibilityRule) -> Tuple[bool, str]:
        """
        Evaluates a single student against an eligibility rule.
        Returns (is_eligible, reason_string).
        """
        # 1. Base administrative active check
        if not student.is_active:
            return False, "Student record is administratively deactivated."

        normalized_id = student.college_id.strip().upper()

        # 2. Explicit exclusion override (Blacklist)
        excluded_ids = [cid.strip().upper() for cid in (rule.excluded_student_ids or [])]
        if normalized_id in excluded_ids:
            return False, f"College ID {student.college_id} is explicitly disqualified by election override."

        # 3. Explicit inclusion override (Whitelist)
        included_ids = [cid.strip().upper() for cid in (rule.included_student_ids or [])]
        if normalized_id in included_ids:
            return True, "Student is explicitly granted eligibility by election override."

        # 4. Enrollment status check
        req_statuses = rule.required_enrollment_statuses or ['ENROLLED']
        if student.enrollment_status not in req_statuses:
            return False, f"Enrollment status '{student.get_enrollment_status_display()}' is not in permitted statuses {req_statuses}."

        # 5. Department filter
        if rule.allowed_departments and len(rule.allowed_departments) > 0:
            allowed_depts_normalized = [d.strip().lower() for d in rule.allowed_departments]
            if student.department.strip().lower() not in allowed_depts_normalized:
                return False, f"Department '{student.department}' is not in the eligible department roster."

        # 6. Academic year filter
        if rule.allowed_academic_years and len(rule.allowed_academic_years) > 0:
            if student.academic_year not in rule.allowed_academic_years:
                return False, f"Academic Year {student.academic_year} is not eligible for this election."

        # 7. Authentication account active status
        if rule.require_active_account and student.user:
            if not student.user.is_active:
                return False, "Associated user login account is currently inactive or suspended."

        return True, "Student satisfies all institutional eligibility criteria."

    @staticmethod
    def get_eligible_students_queryset(rule: ElectionEligibilityRule) -> QuerySet[Student]:
        """
        Constructs an optimized database QuerySet returning all eligible students for the rule.
        """
        # Base criteria query
        q = Q(is_active=True)

        req_statuses = rule.required_enrollment_statuses or ['ENROLLED']
        if req_statuses:
            q &= Q(enrollment_status__in=req_statuses)

        if rule.allowed_departments and len(rule.allowed_departments) > 0:
            q &= Q(department__in=rule.allowed_departments)

        if rule.allowed_academic_years and len(rule.allowed_academic_years) > 0:
            q &= Q(academic_year__in=rule.allowed_academic_years)

        # Exclude blacklisted IDs
        excluded_ids = [cid.strip().upper() for cid in (rule.excluded_student_ids or [])]
        if excluded_ids:
            q &= ~Q(college_id__in=excluded_ids)

        # Include whitelisted IDs even if they don't match demographic filters
        whitelisted_ids = [cid.strip().upper() for cid in (rule.included_student_ids or [])]
        if whitelisted_ids:
            final_query = q | (Q(is_active=True, college_id__in=whitelisted_ids))
        else:
            final_query = q

        return Student.objects.filter(final_query).distinct()

    @staticmethod
    def get_summary_metrics(rule: ElectionEligibilityRule) -> Dict[str, Any]:
        """Returns aggregate eligibility statistics for administration."""
        total_students = Student.objects.count()
        eligible_students = EligibilityEngineService.get_eligible_students_queryset(rule).count()
        ineligible_students = max(0, total_students - eligible_students)

        return {
            "total_registered_students": total_students,
            "eligible_students_count": eligible_students,
            "ineligible_students_count": ineligible_students,
            "percentage_eligible": round((eligible_students / total_students * 100), 2) if total_students > 0 else 0.0
        }
