"""
Management command to provision standard synthetic test accounts and RBAC groups for CampusVote.
DO NOT RUN IN PRODUCTION WITH DEFAULT PASSWORDS.
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group
from apps.accounts.models import User, Role, AccountStatus


class Command(BaseCommand):
    help = "Provisions synthetic demo users and RBAC groups for local development."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Initializing CampusVote RBAC groups..."))

        groups = {
            Role.STUDENT: "StudentGroup",
            Role.ELECTION_ADMIN: "ElectionAdminGroup",
            Role.AUDITOR: "AuditorGroup",
            Role.SUPER_ADMIN: "SuperAdminGroup",
        }

        created_groups = {}
        for role_key, group_name in groups.items():
            group, _ = Group.objects.get_or_create(name=group_name)
            created_groups[role_key] = group

        self.stdout.write(self.style.SUCCESS("RBAC Groups established."))

        demo_accounts = [
            {
                "username": "student_demo",
                "email": "student.demo@campusvote.edu",
                "first_name": "Alex",
                "last_name": "Rivera",
                "college_id": "STU-2026-001",
                "role": Role.STUDENT,
                "password": "CampusVote2026!Student",
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "admin_demo",
                "email": "admin.demo@campusvote.edu",
                "first_name": "Morgan",
                "last_name": "Vance",
                "college_id": "ADM-2026-001",
                "role": Role.ELECTION_ADMIN,
                "password": "CampusVote2026!Admin",
                "is_staff": True,
                "is_superuser": False,
            },
            {
                "username": "auditor_demo",
                "email": "auditor.demo@campusvote.edu",
                "first_name": "Taylor",
                "last_name": "Chen",
                "college_id": "AUD-2026-001",
                "role": Role.AUDITOR,
                "password": "CampusVote2026!Auditor",
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "super_demo",
                "email": "super.demo@campusvote.edu",
                "first_name": "Jordan",
                "last_name": "Blake",
                "college_id": "SUP-2026-001",
                "role": Role.SUPER_ADMIN,
                "password": "CampusVote2026!Super",
                "is_staff": True,
                "is_superuser": True,
            },
        ]

        self.stdout.write(self.style.NOTICE("Provisioning synthetic accounts..."))

        for acc in demo_accounts:
            user, created = User.objects.get_or_create(
                username=acc["username"],
                defaults={
                    "email": acc["email"],
                    "first_name": acc["first_name"],
                    "last_name": acc["last_name"],
                    "college_id": acc["college_id"],
                    "role": acc["role"],
                    "status": AccountStatus.ACTIVE,
                    "is_active": True,
                    "is_staff": acc["is_staff"],
                    "is_superuser": acc["is_superuser"],
                }
            )

            # Ensure attributes and password are set reliably
            user.email = acc["email"]
            user.first_name = acc["first_name"]
            user.last_name = acc["last_name"]
            user.college_id = acc["college_id"]
            user.role = acc["role"]
            user.status = AccountStatus.ACTIVE
            user.is_active = True
            user.is_staff = acc["is_staff"]
            user.is_superuser = acc["is_superuser"]
            user.set_password(acc["password"])
            user.save()

            # Assign group
            group = created_groups.get(acc["role"])
            if group:
                user.groups.add(group)

            action_str = "Created" if created else "Updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f"[{action_str}] {acc['role']}: {acc['username']} ({acc['college_id']}) with password '{acc['password']}'"
                )
            )

        self.stdout.write(self.style.SUCCESS("All synthetic demo accounts provisioned successfully."))
