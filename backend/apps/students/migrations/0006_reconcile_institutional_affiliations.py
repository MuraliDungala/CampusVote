# Generated for CampusVote multi-college reconciliation

from django.db import migrations


def reconcile_institutional_affiliations(apps, schema_editor):
    Student = apps.get_model('students', 'Student')
    Institution = apps.get_model('accounts', 'Institution')
    User = apps.get_model('accounts', 'User')

    # Build domain map for verified institutions
    domain_map = {}
    for inst in Institution.objects.all():
        if inst.email_domain:
            domain_map[inst.email_domain.strip().lower()] = inst

    # Reconcile students whose institutional email domain definitively indicates their home college
    for student in Student.objects.all():
        domain = student.email.split('@')[1].strip().lower() if '@' in student.email else ''
        target_inst = domain_map.get(domain)
        
        if target_inst and student.institution_id != target_inst.id:
            student.institution = target_inst
            student.college_name = target_inst.name
            student.save(update_fields=['institution', 'college_name'])

        # Ensure linked user account institution is synchronized with student registry record
        if student.user_id:
            user = User.objects.filter(id=student.user_id).first()
            if user and student.institution_id and user.institution_id != student.institution_id:
                user.institution = student.institution
                user.save(update_fields=['institution'])


def reverse_reconcile(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0005_backfill_institutions'),
        ('accounts', '0002_institution_user_institution'),
        ('elections', '0002_election_institution'),
    ]

    operations = [
        migrations.RunPython(reconcile_institutional_affiliations, reverse_reconcile),
    ]
