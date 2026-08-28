import os

import pytest
from sqlalchemy import create_engine, text

from app.config import get_settings


@pytest.fixture
def db_engine():
    settings = get_settings()
    engine = create_engine(settings.database_url)
    yield engine
    engine.dispose()


@pytest.mark.skipif(
    os.getenv("SKIP_DB_TESTS", "false").lower() == "true",
    reason="Tests de DB deshabilitados",
)
def test_database_connection(db_engine):
    with db_engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar() == 1


@pytest.mark.skipif(
    os.getenv("SKIP_DB_TESTS", "false").lower() == "true",
    reason="Tests de DB deshabilitados",
)
def test_roles_table_exists(db_engine):
    with db_engine.connect() as conn:
        result = conn.execute(
            text("SELECT COUNT(*) FROM roles WHERE nombre = 'admin'")
        )
        assert result.scalar() >= 1
