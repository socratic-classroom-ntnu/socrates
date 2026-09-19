"""json -> jsonb

第二輪的班級論點分佈要對 stance_by_stage 與 observations 做聚合與過濾
（設計規格 §7）。json 型別無法建索引、運算子支援也差；jsonb 可建 GIN 索引、
支援包含查詢，而且寫入時會把 \\uXXXX 正規化回字元，直接看資料時讀得懂。

型別選在資料累積之前換掉最便宜。

Revision ID: 8f1c2d4e6a30
Revises: d7474ff71319
"""

from collections.abc import Sequence

from alembic import op

revision: str = "8f1c2d4e6a30"
down_revision: str | None = "d7474ff71319"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = (
    ("messages", "observations"),
    ("summaries", "stance_by_stage"),
    ("summaries", "raw"),
)


def upgrade() -> None:
    for table, column in _COLUMNS:
        op.execute(f"alter table {table} alter column {column} type jsonb using {column}::jsonb")


def downgrade() -> None:
    for table, column in _COLUMNS:
        op.execute(f"alter table {table} alter column {column} type json using {column}::json")
