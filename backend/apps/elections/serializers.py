"""
Election, Position, and Candidate Serializers.
CampusVote Phase 3 Architecture.
"""

from rest_framework import serializers
from django.utils import timezone
from apps.elections.models import Election, ElectionPosition, Candidate, ElectionStatus, CandidateStatus
from apps.students.models import Student


class ElectionPositionSerializer(serializers.ModelSerializer):
    candidates_count = serializers.SerializerMethodField()
    approved_candidates_count = serializers.SerializerMethodField()

    class Meta:
        model = ElectionPosition
        fields = [
            'id',
            'election',
            'title',
            'description',
            'display_order',
            'maximum_candidates',
            'candidates_count',
            'approved_candidates_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'candidates_count', 'approved_candidates_count']

    def get_candidates_count(self, obj):
        return obj.candidates.count()

    def get_approved_candidates_count(self, obj):
        return obj.candidates.filter(status=CandidateStatus.APPROVED).count()

    def validate_title(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Position title cannot be empty.")
        return value.strip()

    def validate(self, attrs):
        election = attrs.get('election') or (self.instance.election if self.instance else None)
        title = attrs.get('title')

        if election and title:
            # Case-insensitive duplicate check within same election
            qs = ElectionPosition.objects.filter(
                election=election,
                title__iexact=title.strip()
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    'title': f"A position titled '{title.strip()}' already exists for this election."
                })

        # Disallow adding/modifying positions in active or closed elections
        if election and election.status in (
            ElectionStatus.ACTIVE,
            ElectionStatus.CLOSED,
            ElectionStatus.RESULTS_PUBLISHED,
            ElectionStatus.ARCHIVED
        ):
            raise serializers.ValidationError(
                f"Positions cannot be modified in an election with status '{election.status}'."
            )

        return attrs


class CandidatePublicSerializer(serializers.ModelSerializer):
    """
    Public candidate presentation serializer.
    Strictly sanitizes internal student data; exposes only campaign-relevant public details.
    """
    position_title = serializers.CharField(source='election_position.title', read_only=True)
    candidate_name = serializers.CharField(source='student.full_name', read_only=True)
    department = serializers.CharField(source='student.department', read_only=True)
    academic_year = serializers.IntegerField(source='student.academic_year', read_only=True)

    class Meta:
        model = Candidate
        fields = [
            'id',
            'position_title',
            'candidate_name',
            'department',
            'academic_year',
            'manifesto',
            'profile_image',
            'status',
        ]


class CandidateAdminSerializer(serializers.ModelSerializer):
    """
    Detailed candidate serializer for election administrators and student nomination tracking.
    """
    student_id = serializers.UUIDField(source='student.id', read_only=True)
    student_college_id = serializers.CharField(source='student.college_id', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    department = serializers.CharField(source='student.department', read_only=True)
    academic_year = serializers.IntegerField(source='student.academic_year', read_only=True)
    enrollment_status = serializers.CharField(source='student.enrollment_status', read_only=True)
    position_title = serializers.CharField(source='election_position.title', read_only=True)
    election_id = serializers.UUIDField(source='election_position.election.id', read_only=True)
    election_title = serializers.CharField(source='election_position.election.title', read_only=True)
    reviewed_by_username = serializers.CharField(source='reviewed_by.username', read_only=True, default=None)

    class Meta:
        model = Candidate
        fields = [
            'id',
            'student_id',
            'student_college_id',
            'student_name',
            'department',
            'academic_year',
            'enrollment_status',
            'election_position',
            'position_title',
            'election_id',
            'election_title',
            'manifesto',
            'profile_image',
            'status',
            'submitted_at',
            'reviewed_at',
            'reviewed_by_username',
            'rejection_reason',
            'eligibility_snapshot',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id', 'student_id', 'student_college_id', 'student_name', 'department',
            'academic_year', 'enrollment_status', 'position_title', 'election_id',
            'election_title', 'status', 'submitted_at', 'reviewed_at', 'reviewed_by_username',
            'rejection_reason', 'eligibility_snapshot', 'created_at', 'updated_at'
        ]


class NominationCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Candidate
        fields = [
            'id',
            'election_position',
            'manifesto',
            'profile_image',
        ]
        read_only_fields = ['id']

    def validate_election_position(self, position):
        election = position.election
        if election.status not in (ElectionStatus.DRAFT, ElectionStatus.SCHEDULED):
            raise serializers.ValidationError(
                f"Nominations are closed for this election (Status: {election.status})."
            )
        return position


class NominationReviewSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject'])
    rejection_reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs['action'] == 'reject' and not attrs.get('rejection_reason', '').strip():
            raise serializers.ValidationError({
                'rejection_reason': "Rejection reason is required when rejecting a nomination."
            })
        return attrs


class ElectionListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    institution_id = serializers.UUIDField(source='institution.id', read_only=True, default=None)
    institution_name = serializers.CharField(source='institution.name', read_only=True, default=None)
    institution_code = serializers.CharField(source='institution.code', read_only=True, default=None)
    positions_count = serializers.SerializerMethodField()
    candidates_count = serializers.SerializerMethodField()
    approved_candidates_count = serializers.SerializerMethodField()
    is_eligible = serializers.SerializerMethodField()
    eligibility_reason = serializers.SerializerMethodField()
    can_vote = serializers.SerializerMethodField()
    has_voted = serializers.SerializerMethodField()

    class Meta:
        model = Election
        fields = [
            'id',
            'title',
            'description',
            'academic_year',
            'institution_id',
            'institution_name',
            'institution_code',
            'start_time',
            'end_time',
            'status',
            'status_display',
            'positions_count',
            'candidates_count',
            'approved_candidates_count',
            'is_eligible',
            'eligibility_reason',
            'can_vote',
            'has_voted',
            'created_at',
            'updated_at',
            'published_at',
        ]

    def get_positions_count(self, obj):
        return obj.positions.count()

    def get_candidates_count(self, obj):
        return Candidate.objects.filter(election_position__election=obj).count()

    def get_approved_candidates_count(self, obj):
        return Candidate.objects.filter(election_position__election=obj, status=CandidateStatus.APPROVED).count()

    def _get_student(self):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated or getattr(request.user, 'role', None) != 'STUDENT':
            return None
        return getattr(request.user, 'student_record', None)

    def get_is_eligible(self, obj):
        student = self._get_student()
        if not student:
            return None
        if obj.institution_id and student.institution_id and obj.institution_id != student.institution_id:
            return False
        from apps.eligibility.models import ElectionEligibilityRule
        from apps.eligibility.services import EligibilityEngineService
        rule = ElectionEligibilityRule.objects.filter(election_id=obj.id, is_active=True).first()
        if not rule:
            return student.is_active
        eligible, _ = EligibilityEngineService.evaluate_student(student, rule)
        return eligible

    def get_eligibility_reason(self, obj):
        student = self._get_student()
        if not student:
            return None
        if obj.institution_id and student.institution_id and obj.institution_id != student.institution_id:
            return "This election belongs to a different educational institution."
        from apps.eligibility.models import ElectionEligibilityRule
        from apps.eligibility.services import EligibilityEngineService
        rule = ElectionEligibilityRule.objects.filter(election_id=obj.id, is_active=True).first()
        if not rule:
            return "Eligible for general collegiate ballot." if student.is_active else "Student record is inactive."
        _, reason = EligibilityEngineService.evaluate_student(student, rule)
        return reason

    def get_has_voted(self, obj):
        student = self._get_student()
        if not student:
            return False
        from apps.voting.models import VoterParticipationRecord
        return VoterParticipationRecord.objects.filter(election=obj, student=student).exists()

    def get_can_vote(self, obj):
        student = self._get_student()
        if not student:
            return False
        now = timezone.now()
        if obj.status != ElectionStatus.ACTIVE or not (obj.start_time <= now <= obj.end_time):
            return False
        if self.get_has_voted(obj):
            return False
        return bool(self.get_is_eligible(obj))


class ElectionDetailSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    institution_id = serializers.UUIDField(source='institution.id', read_only=True, default=None)
    institution_name = serializers.CharField(source='institution.name', read_only=True, default=None)
    institution_code = serializers.CharField(source='institution.code', read_only=True, default=None)
    positions = ElectionPositionSerializer(many=True, read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)
    positions_count = serializers.SerializerMethodField()
    candidates_count = serializers.SerializerMethodField()
    approved_candidates_count = serializers.SerializerMethodField()
    pending_nominations_count = serializers.SerializerMethodField()
    is_eligible = serializers.SerializerMethodField()
    eligibility_reason = serializers.SerializerMethodField()
    can_vote = serializers.SerializerMethodField()
    has_voted = serializers.SerializerMethodField()

    class Meta:
        model = Election
        fields = [
            'id',
            'title',
            'description',
            'academic_year',
            'institution_id',
            'institution_name',
            'institution_code',
            'start_time',
            'end_time',
            'status',
            'status_display',
            'created_by_username',
            'positions',
            'positions_count',
            'candidates_count',
            'approved_candidates_count',
            'pending_nominations_count',
            'is_eligible',
            'eligibility_reason',
            'can_vote',
            'has_voted',
            'created_at',
            'updated_at',
            'published_at',
            'archived_at',
        ]

    def get_positions_count(self, obj):
        return obj.positions.count()

    def get_candidates_count(self, obj):
        return Candidate.objects.filter(election_position__election=obj).count()

    def get_approved_candidates_count(self, obj):
        return Candidate.objects.filter(election_position__election=obj, status=CandidateStatus.APPROVED).count()

    def _get_student(self):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated or getattr(request.user, 'role', None) != 'STUDENT':
            return None
        return getattr(request.user, 'student_record', None)

    def get_is_eligible(self, obj):
        student = self._get_student()
        if not student:
            return None
        if obj.institution_id and student.institution_id and obj.institution_id != student.institution_id:
            return False
        from apps.eligibility.models import ElectionEligibilityRule
        from apps.eligibility.services import EligibilityEngineService
        rule = ElectionEligibilityRule.objects.filter(election_id=obj.id, is_active=True).first()
        if not rule:
            return student.is_active
        eligible, _ = EligibilityEngineService.evaluate_student(student, rule)
        return eligible

    def get_eligibility_reason(self, obj):
        student = self._get_student()
        if not student:
            return None
        if obj.institution_id and student.institution_id and obj.institution_id != student.institution_id:
            return "This election belongs to a different educational institution."
        from apps.eligibility.models import ElectionEligibilityRule
        from apps.eligibility.services import EligibilityEngineService
        rule = ElectionEligibilityRule.objects.filter(election_id=obj.id, is_active=True).first()
        if not rule:
            return "Eligible for general collegiate ballot." if student.is_active else "Student record is inactive."
        _, reason = EligibilityEngineService.evaluate_student(student, rule)
        return reason

    def get_has_voted(self, obj):
        student = self._get_student()
        if not student:
            return False
        from apps.voting.models import VoterParticipationRecord
        return VoterParticipationRecord.objects.filter(election=obj, student=student).exists()

    def get_can_vote(self, obj):
        student = self._get_student()
        if not student:
            return False
        now = timezone.now()
        if obj.status != ElectionStatus.ACTIVE or not (obj.start_time <= now <= obj.end_time):
            return False
        if self.get_has_voted(obj):
            return False
        return bool(self.get_is_eligible(obj))

    def get_pending_nominations_count(self, obj):
        return Candidate.objects.filter(
            election_position__election=obj,
            status__in=[CandidateStatus.SUBMITTED, CandidateStatus.UNDER_REVIEW]
        ).count()


class ElectionCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Election
        fields = [
            'id',
            'title',
            'description',
            'academic_year',
            'institution',
            'start_time',
            'end_time',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        start_time = attrs.get('start_time') or (self.instance.start_time if self.instance else None)
        end_time = attrs.get('end_time') or (self.instance.end_time if self.instance else None)

        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({
                'end_time': "Election end time must be later than the scheduled start time."
            })

        # Disallow modifying dates of active or closed elections
        if self.instance and self.instance.status in (
            ElectionStatus.ACTIVE,
            ElectionStatus.CLOSED,
            ElectionStatus.RESULTS_PUBLISHED,
            ElectionStatus.ARCHIVED
        ):
            if 'start_time' in attrs or 'end_time' in attrs:
                raise serializers.ValidationError(
                    f"Cannot modify schedule of an election with status '{self.instance.status}'."
                )

        return attrs


class ElectionTransitionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")
