"""Solo attempts walk scenarios in the student's own words: no options, no fixed question list.

An attempt's ``progress`` entries and its messages used to point at the activity's questions and
the options the student picked. Those no longer exist (0018), so upgrade deletes every attempt and
message instead of translating them: the data cannot be rebuilt, and no compatibility is kept.
The question position columns become scenario positions. Downgrade only renames the columns back.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM solo_messages")
    op.execute("DELETE FROM solo_attempts")
    op.alter_column("solo_attempts", "question_index", new_column_name="scenario_index")
    op.alter_column("solo_messages", "question_index", new_column_name="scenario_index")


def downgrade() -> None:
    op.alter_column("solo_messages", "scenario_index", new_column_name="question_index")
    op.alter_column("solo_attempts", "scenario_index", new_column_name="question_index")
