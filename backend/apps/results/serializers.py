"""
Serializers for Election Results Management, Verification, and Public Reporting.
CampusVote Phase 8 Architecture.
"""

from rest_framework import serializers
from apps.results.models import (
    ElectionResult,
    ElectionPositionResult,
    ResultLifecycleStatus,
    TallySourceType,
    ReconciliationStatus,
    VerificationStatus
)


class ElectionPositionResultSerializer(serializers.ModelSerializer):
    """Serializes aggregate position results and candidate rankings."""

    class Meta:
        model = ElectionPositionResult
        fields = [
            'id',
            'position',
            'position_title',
            'total_votes_cast',
            'abstention_count',
            'is_tied',
            'tie_details',
            'winner_candidate_id',
            'winner_candidate_name',
            'candidate_tallies',
            'created_at'
        ]


class ElectionResultListSerializer(serializers.ModelSerializer):
    """Compact summary serializer for result version listings."""
    calculated_by_email = serializers.CharField(source='calculated_by.email', read_only=True, default=None)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    tally_source_display = serializers.CharField(source='get_tally_source_type_display', read_only=True)
    lifecycle_status = serializers.CharField(source='status', read_only=True)

    class Meta:
        model = ElectionResult
        fields = [
            'id',
            'election',
            'version',
            'is_synthetic',
            'tally_source_type',
            'tally_source_display',
            'status',
            'lifecycle_status',
            'status_display',
            'total_ballots_tallied',
            'total_abstentions',
            'total_positions_tallied',
            'integrity_status',
            'reconciliation_status',
            'result_digest',
            'calculated_by_email',
            'created_at',
            'published_at'
        ]


class ElectionResultDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for administrative results management and audit review."""
    position_results = ElectionPositionResultSerializer(many=True, read_only=True)
    calculated_by_email = serializers.CharField(source='calculated_by.email', read_only=True, default=None)
    reviewed_by_email = serializers.CharField(source='reviewed_by.email', read_only=True, default=None)
    approved_by_email = serializers.CharField(source='approved_by.email', read_only=True, default=None)
    published_by_email = serializers.CharField(source='published_by.email', read_only=True, default=None)
    election_title = serializers.CharField(source='election.title', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    tally_source_display = serializers.CharField(source='get_tally_source_type_display', read_only=True)
    lifecycle_status = serializers.CharField(source='status', read_only=True)

    class Meta:
        model = ElectionResult
        fields = [
            'id',
            'election',
            'election_title',
            'version',
            'is_synthetic',
            'tally_source_type',
            'tally_source_display',
            'status',
            'lifecycle_status',
            'status_display',
            'total_ballots_tallied',
            'total_abstentions',
            'total_positions_tallied',
            'integrity_status',
            'integrity_details',
            'reconciliation_status',
            'reconciliation_details',
            'publication_blockers',
            'result_digest',
            'aggregate_snapshot',
            'calculated_by_email',
            'reviewed_by_email',
            'reviewed_at',
            'review_decision',
            'review_notes',
            'approved_by_email',
            'approved_at',
            'approval_notes',
            'published_by_email',
            'published_at',
            'superseded_by',
            'superseded_at',
            'superseded_reason',
            'position_results',
            'created_at',
            'updated_at'
        ]


class PublicElectionResultSerializer(serializers.ModelSerializer):
    """
    Publicly accessible results serializer for students and community members.
    Strictly filters out internal review notes, administrative secrets, or sensitive audit metadata.
    """
    id = serializers.CharField(read_only=True)
    election_id = serializers.CharField(source='election.id', read_only=True)
    election_title = serializers.CharField(source='election.title', read_only=True)
    academic_year = serializers.CharField(source='election.academic_year', read_only=True)
    position_results = ElectionPositionResultSerializer(many=True, read_only=True)
    positions = serializers.SerializerMethodField()

    class Meta:
        model = ElectionResult
        fields = [
            'id',
            'election_id',
            'election_title',
            'academic_year',
            'version',
            'is_synthetic',
            'total_ballots_tallied',
            'total_positions_tallied',
            'total_abstentions',
            'result_digest',
            'published_at',
            'position_results',
            'positions'
        ]

    def get_positions(self, obj):
        return ElectionPositionResultSerializer(obj.position_results.all(), many=True).data


# --- Request Action Serializers ---

class CalculateResultRequestSerializer(serializers.Serializer):
    use_synthetic = serializers.BooleanField(
        default=False,
        required=False,
        help_text="If true, uses synthetic test fixtures. Only permitted in development or testing."
    )
    is_synthetic = serializers.BooleanField(
        default=False,
        required=False,
        help_text="Alias for use_synthetic."
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default=""
    )

    def validate(self, data):
        if 'is_synthetic' in data and not data.get('use_synthetic'):
            data['use_synthetic'] = data['is_synthetic']
        return data



class ReviewResultRequestSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(
        choices=['ACCEPTED', 'REJECTED'],
        required=True
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000
    )

    def validate(self, data):
        if data['decision'] == 'REJECTED' and not data.get('notes', '').strip():
            raise serializers.ValidationError({"notes": "Justification notes are required when rejecting a result."})
        return data


class ApproveResultRequestSerializer(serializers.Serializer):
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        default=""
    )
