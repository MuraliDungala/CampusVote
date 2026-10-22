# Generated for CampusVote multi-college migration

from django.db import migrations


def backfill_institutions(apps, schema_editor):
    Student = apps.get_model('students', 'Student')
    Institution = apps.get_model('accounts', 'Institution')
    Election = apps.get_model('elections', 'Election')
    User = apps.get_model('accounts', 'User')

    # Locate default demo institution if present
    main_inst = Institution.objects.filter(code='CAMPUSVOTE-MAIN').first()
    if not main_inst:
        main_inst = Institution.objects.filter(name='CampusVote Collegiate Institute').first()

    if main_inst:
        # Match only students whose college_name clearly matches the default institution
        for student in Student.objects.filter(institution__isnull=True):
            if student.college_name and student.college_name.strip() == main_inst.name:
                student.institution = main_inst
                student.save(update_fields=['institution'])
            # Legacy records whose college cannot be established reliably remain institution=None with PENDING review

        # Backfill elections initialized by users under main_inst
        for election in Election.objects.filter(institution__isnull=True):
            if election.created_by and getattr(election.created_by, 'institution_id', None):
                election.institution = election.created_by.institution
                election.save(update_fields=['institution'])
            elif main_inst:
                election.institution = main_inst
                election.save(update_fields=['institution'])


def reverse_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0004_importsession_institution_student_institution'),
        ('accounts', '0002_institution_user_institution'),
        ('elections', '0002_election_institution'),
    ]

    operations = [
        migrations.RunPython(backfill_institutions, reverse_backfill),
    ]
