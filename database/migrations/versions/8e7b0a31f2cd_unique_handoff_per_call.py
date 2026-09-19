"""enforce one handoff task per call

Revision ID: 8e7b0a31f2cd
Revises: 4b020a33b947
Create Date: 2026-09-17 22:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "8e7b0a31f2cd"
down_revision: str | None = "4b020a33b947"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_handoff_tasks_organization_id_call_id",
        "handoff_tasks",
        ["organization_id", "call_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_handoff_tasks_organization_id_call_id",
        "handoff_tasks",
        type_="unique",
    )
