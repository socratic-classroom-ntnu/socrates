"""Provider profiles, session credentials, account settings, and AI actor profile binding."""

from alembic import op
import sqlalchemy as sa

revision = "0097"
down_revision = "0088"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("r97_provider_profiles") and "provider_profile_id" in {
        column["name"] for column in inspector.get_columns("r88_ai_students")
    }:
        # A fresh database: 0006 (Base.metadata.create_all) already created the R97 tables and column.
        return
    op.create_table(
        "r97_provider_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("r2_accounts.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("adapter", sa.String(32), nullable=False),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("organization", sa.String(200), nullable=True),
        sa.Column("project", sa.String(200), nullable=True),
        sa.Column("default_model", sa.String(200), nullable=False),
        sa.Column(
            "credential_mode",
            sa.String(24),
            nullable=False,
            server_default="PERSISTENT",
        ),
        sa.Column("encrypted_secret", sa.Text(), nullable=True),
        sa.Column("secret_last4", sa.String(4), nullable=True),
        sa.Column(
            "key_version",
            sa.String(40),
            nullable=False,
            server_default="v1",
        ),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "metadata_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "updated_at",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.UniqueConstraint("owner_id", "name", name="uq_r97_profile_owner_name"),
    )
    op.create_index(
        "ix_r97_provider_profiles_owner",
        "r97_provider_profiles",
        ["owner_id"],
    )

    op.create_table(
        "r97_session_provider_secrets",
        sa.Column(
            "profile_id",
            sa.String(36),
            sa.ForeignKey("r97_provider_profiles.id"),
            primary_key=True,
        ),
        sa.Column(
            "session_token_hash",
            sa.String(64),
            sa.ForeignKey("r2_login_sessions.token_hash"),
            primary_key=True,
        ),
        sa.Column("encrypted_secret", sa.Text(), nullable=False),
        sa.Column("secret_last4", sa.String(4), nullable=False),
        sa.Column(
            "key_version",
            sa.String(40),
            nullable=False,
            server_default="v1",
        ),
        sa.Column("expires_at", sa.Float(), nullable=False),
        sa.Column(
            "updated_at",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.create_index(
        "ix_r97_session_provider_secret_expiry",
        "r97_session_provider_secrets",
        ["expires_at"],
    )

    op.create_table(
        "r97_account_ai_settings",
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("r2_accounts.id"),
            primary_key=True,
        ),
        sa.Column(
            "default_profile_id",
            sa.String(36),
            sa.ForeignKey("r97_provider_profiles.id"),
            nullable=True,
        ),
        sa.Column(
            "fallback_profile_id",
            sa.String(36),
            sa.ForeignKey("r97_provider_profiles.id"),
            nullable=True,
        ),
        sa.Column(
            "model_matrix",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "budgets",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "session_token_hash",
            sa.String(64),
            nullable=True,
        ),
        sa.Column(
            "revision",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "updated_at",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    with op.batch_alter_table("r88_ai_students") as batch:
        batch.add_column(
            sa.Column(
                "provider_profile_id",
                sa.String(36),
                nullable=True,
            )
        )
        batch.create_foreign_key(
            "fk_r88_ai_student_provider_profile",
            "r97_provider_profiles",
            ["provider_profile_id"],
            ["id"],
        )


def downgrade():
    with op.batch_alter_table("r88_ai_students") as batch:
        batch.drop_constraint(
            "fk_r88_ai_student_provider_profile",
            type_="foreignkey",
        )
        batch.drop_column("provider_profile_id")
    op.drop_table("r97_account_ai_settings")
    op.drop_index(
        "ix_r97_session_provider_secret_expiry",
        table_name="r97_session_provider_secrets",
    )
    op.drop_table("r97_session_provider_secrets")
    op.drop_index(
        "ix_r97_provider_profiles_owner",
        table_name="r97_provider_profiles",
    )
    op.drop_table("r97_provider_profiles")
