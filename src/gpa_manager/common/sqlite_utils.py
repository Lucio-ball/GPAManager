from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator
from uuid import uuid4

import sqlite3


def commit_if_needed(connection: sqlite3.Connection, was_in_transaction: bool) -> None:
    if not was_in_transaction:
        connection.commit()


@contextmanager
def atomic(connection: sqlite3.Connection) -> Iterator[None]:
    savepoint_name = f"sp_{uuid4().hex}"
    connection.execute(f"SAVEPOINT {savepoint_name}")
    try:
        yield
    except Exception:
        connection.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
        connection.execute(f"RELEASE SAVEPOINT {savepoint_name}")
        raise
    else:
        connection.execute(f"RELEASE SAVEPOINT {savepoint_name}")
