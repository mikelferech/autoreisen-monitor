import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

STATE_FILE = Path(os.getenv("STATE_FILE", "price_state.json"))
WORKER_URL = (os.getenv("MFE_WORKER_URL") or "").rstrip("/")
SECRET = os.getenv("MFE_MONITOR_SECRET") or ""


def main() -> None:
    if not WORKER_URL or not SECRET:
        raise RuntimeError("Faltan MFE_WORKER_URL o MFE_MONITOR_SECRET en los secretos de GitHub.")
    if not STATE_FILE.exists():
        raise RuntimeError(f"No existe {STATE_FILE}; el monitor AutoReisen no generó el estado.")

    state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    price = float(state.get("last_price", 0))
    if price <= 0:
        raise RuntimeError("price_state.json no contiene un precio válido.")

    history = state.get("history") or []
    checked_at = history[-1].get("date") if history and isinstance(history[-1], dict) else None
    if not checked_at:
        checked_at = datetime.now(timezone.utc).isoformat()

    result = {
        "ok": True,
        "status": "ok",
        "source": "AutoReisen · monitor Selenium existente",
        "checkedAt": checked_at,
        "price": price,
        "total": price,
        "pricePerDay": price / 7,
        "availability": "Disponible",
        "group": "E",
        "model": "Seat Arona",
        "pickupAt": "2026-09-14T09:00:00+01:00",
        "dropoffAt": "2026-09-21T15:00:00+01:00",
    }

    response = requests.post(
        WORKER_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SECRET}",
        },
        json={"action": "monitor-write", "type": "autoreisen", "result": result},
        timeout=30,
    )
    if not response.ok:
        raise RuntimeError(f"Worker {response.status_code}: {response.text}")
    print("AutoReisen enviado correctamente a MFE Viajes:", price)


if __name__ == "__main__":
    main()
