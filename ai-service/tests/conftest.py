"""Test helpers. These build SYNTHETIC series for unit tests only — never used at runtime."""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app

START = date(2026, 1, 1)


def make_history(values: list[float], start: date = START) -> list[dict]:
    return [
        {"date": (start + timedelta(days=i)).isoformat(), "quantity": v}
        for i, v in enumerate(values)
    ]


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
