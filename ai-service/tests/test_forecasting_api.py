from __future__ import annotations

from tests.conftest import make_history

PREFIX = "/api/v1/ai"


def test_health(client):
    r = client.get(f"{PREFIX}/health")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True and body["data"]["status"] == "ok"
    assert {"request_id", "generated_at", "service", "service_version"} <= body["meta"].keys()


def test_forecast_success_envelope(client):
    payload = {"product_id": "p1", "product_name": "Coca-Cola 1L",
               "sales_history": make_history([15] * 30), "horizon_days": 7}
    r = client.post(f"{PREFIX}/forecast", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True and body["error"] is None
    data = body["data"]
    assert data["status"] == "ok" and data["is_demo"] is False
    assert data["predicted_demand_units"] == 105
    assert len(data["daily_forecast"]) == 7


def test_forecast_insufficient_data_is_200_not_error(client):
    payload = {"product_id": "p2", "product_name": "New Product", "sales_history": []}
    r = client.post(f"{PREFIX}/forecast", json=payload)
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "insufficient_data"


def test_validation_error_uses_envelope(client):
    payload = {"product_id": "p1", "product_name": "X",
               "sales_history": [{"date": "2026-01-01", "quantity": -5}]}
    r = client.post(f"{PREFIX}/forecast", json=payload)
    assert r.status_code == 422
    body = r.json()
    assert body["success"] is False and body["data"] is None
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert any("quantity" in d["field"] for d in body["error"]["details"])


def test_horizon_limit(client):
    payload = {"product_id": "p1", "product_name": "X", "sales_history": [], "horizon_days": 365}
    assert client.post(f"{PREFIX}/forecast", json=payload).status_code == 422


def test_batch(client):
    payload = {
        "horizon_days": 14,
        "products": [
            {"product_id": "a", "product_name": "A", "sales_history": make_history([5] * 30)},
            {"product_id": "b", "product_name": "B", "sales_history": make_history([5] * 3)},
        ],
    }
    r = client.post(f"{PREFIX}/forecast/batch", json=payload)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["total_products"] == 2 and data["forecasted"] == 1 and data["insufficient_data"] == 1
    assert data["results"][0]["horizon_days"] == 14


def test_api_key_enforced(client, monkeypatch):
    from app.core import config
    monkeypatch.setattr(config, "get_settings", lambda: config.Settings(api_key="secret"))
    from app.core import security
    monkeypatch.setattr(security, "get_settings", lambda: config.Settings(api_key="secret"))
    payload = {"product_id": "p", "product_name": "X", "sales_history": []}
    assert client.post(f"{PREFIX}/forecast", json=payload).status_code == 401
    ok = client.post(f"{PREFIX}/forecast", json=payload, headers={"X-API-Key": "secret"})
    assert ok.status_code == 200


def test_unknown_route_uses_envelope(client):
    r = client.get(f"{PREFIX}/does-not-exist")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
