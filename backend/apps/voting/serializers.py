"""
Serializers for Anonymous Ballot Presentation and Submission.
CampusVote Smart ID-Based College Voting System - Phase 5 Architecture.
"""

from rest_framework import serializers


class CandidateSummaryBallotSerializer(serializers.Serializer):
    """Public summary of an approved candidate for ballot presentation."""
    id = serializers.UUIDField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    manifesto = serializers.CharField(read_only=True)
    profile_image = serializers.CharField(read_only=True, allow_null=True)


class PositionBallotSerializer(serializers.Serializer):
    """Position presentation with approved candidate choices on the ballot."""
    id = serializers.UUIDField(read_only=True)
    title = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)
    display_order = serializers.IntegerField(read_only=True)
    maximum_candidates = serializers.IntegerField(read_only=True)
    allow_abstain = serializers.BooleanField(read_only=True, default=True)
    candidates = CandidateSummaryBallotSerializer(many=True, read_only=True)
    candidate_count = serializers.IntegerField(read_only=True)


class BallotDefinitionSerializer(serializers.Serializer):
    """Complete official ballot definition for an election cycle."""
    election = serializers.DictField(read_only=True)
    positions = PositionBallotSerializer(many=True, read_only=True)
    total_positions = serializers.IntegerField(read_only=True)
    allow_abstain_global = serializers.BooleanField(read_only=True, default=True)


class PositionSelectionItemSerializer(serializers.Serializer):
    """Single position selection or abstention on a submitted ballot."""
    position_id = serializers.UUIDField(required=True)
    candidate_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    is_abstain = serializers.BooleanField(required=False, default=False)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            allowed_keys = {'position_id', 'candidate_id', 'is_abstain'}
            extra_keys = set(data.keys()) - allowed_keys
            if extra_keys:
                raise serializers.ValidationError(
                    f"Disallowed or injected attributes found in ballot selection: {list(extra_keys)}"
                )
        return super().to_internal_value(data)

    def validate(self, data):
        is_abstain = data.get('is_abstain', False)
        candidate_id = data.get('candidate_id')

        if is_abstain and candidate_id:
            raise serializers.ValidationError(
                "Cannot select both a candidate and the abstention option for the same position."
            )
        if not is_abstain and not candidate_id:
            raise serializers.ValidationError(
                "Either a candidate must be chosen or the abstention option selected."
            )
        return data


class BallotSubmissionSerializer(serializers.Serializer):
    """Encapsulates the voter's submitted choices across all election positions."""
    selections = PositionSelectionItemSerializer(many=True, required=True)

    def validate_selections(self, value):
        if not value or len(value) == 0:
            raise serializers.ValidationError("Ballot must contain at least one position selection.")
        return value


class BallotSubmissionResponseSerializer(serializers.Serializer):
    """Receipt response returned to voter after successful ballot acceptance."""
    status = serializers.CharField(read_only=True)
    receipt_id = serializers.CharField(read_only=True)
    election_id = serializers.UUIDField(read_only=True)
    submitted_at = serializers.DateTimeField(read_only=True)
    message = serializers.CharField(read_only=True)


class VoterParticipationStatusSerializer(serializers.Serializer):
    """Reports whether the authenticated student has participated and their eligibility state."""
    election_id = serializers.UUIDField(read_only=True)
    has_participated = serializers.BooleanField(read_only=True)
    participated_at = serializers.DateTimeField(read_only=True, allow_null=True)
    is_eligible = serializers.BooleanField(read_only=True)
    requires_verification = serializers.BooleanField(read_only=True, default=False)
    message = serializers.CharField(read_only=True)
