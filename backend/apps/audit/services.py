"""
Audit logging service helper functions.
"""

from apps.audit.models import AuditLog, AuditAction


def log_audit_event(
    action: str,
    target_type: str = 'SYSTEM',
    actor=None,
    target_id: str = '',
    metadata: dict = None,
    request=None,
    resource_type: str = None,
    resource_id: str = None
) -> AuditLog:
    """
    Records an append-only audit log entry.
    Safely extracts actor and client IP. Never records sensitive secrets.
    Supports both target_type/target_id and resource_type/resource_id aliases.
    """
    if metadata is None:
        metadata = {}

    final_type = target_type or resource_type or 'SYSTEM'
    final_id = target_id or resource_id or ''

    actor_username = ''
    actor_role = ''
    user_instance = None
    ip_address = None

    if request:
        client_ip = request.META.get('HTTP_X_FORWARDED_FOR') or request.META.get('REMOTE_ADDR')
        if client_ip:
            ip_address = client_ip.split(',')[0].strip()

        req_user = getattr(request, 'user', None)
        if req_user and req_user.is_authenticated:
            user_instance = req_user
            actor_username = req_user.username
            actor_role = getattr(req_user, 'role', '')

    if actor and not user_instance:
        if hasattr(actor, 'is_authenticated') and actor.is_authenticated:
            user_instance = actor
            actor_username = actor.username
            actor_role = getattr(actor, 'role', '')
        elif isinstance(actor, str):
            actor_username = actor

    return AuditLog.objects.create(
        actor=user_instance,
        actor_username=actor_username or 'system',
        actor_role=actor_role,
        action=action,
        target_type=final_type,
        target_id=str(final_id) if final_id is not None else None,
        metadata=metadata,
        ip_address=ip_address
    )
