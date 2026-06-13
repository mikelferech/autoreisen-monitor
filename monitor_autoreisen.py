import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

URL = "https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php"
STATE_FILE = Path(os.getenv("STATE_FILE", "price_state.json"))

# Datos de tu búsqueda
LOCATION_TEXT = os.getenv("LOCATION_TEXT", "Gran Canaria")
CAR_TEXT = os.getenv("CAR_TEXT", "Seat Arona")
CAR_GROUP = os.getenv("CAR_GROUP", "E")
BASELINE_PRICE = float(os.getenv("BASELINE_PRICE", "137.03"))

PICKUP_DAY = os.getenv("PICKUP_DAY", "14")
PICKUP_MONTH_YEAR = os.getenv("PICKUP_MONTH_YEAR", "Sep-2026")
PICKUP_TIME = os.getenv("PICKUP_TIME", "09:00")
RETURN_DAY = os.getenv("RETURN_DAY", "21")
RETURN_MONTH_YEAR = os.getenv("RETURN_MONTH_YEAR", "Sep-2026")
RETURN_TIME = os.getenv("RETURN_TIME", "15:00")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
ALWAYS_NOTIFY = os.getenv("ALWAYS_NOTIFY", "true").lower() == "true"


def euro(value: float) -> str:
    return f"{value:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def send_telegram(text: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Telegram no configurado. Mensaje:")
        print(text)
        return
    resp = requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": TELEGRAM_CHAT_ID, "text": text, "disable_web_page_preview": True},
        timeout=30,
    )
    resp.raise_for_status()


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"last_price": BASELINE_PRICE, "lowest_price": BASELINE_PRICE, "history": []}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def make_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1600,1200")
    options.add_argument("--lang=es-ES")
    return webdriver.Chrome(options=options)


def select_by_visible_text_contains(select_el, wanted: str) -> None:
    sel = Select(select_el)
    wanted_norm = wanted.casefold().strip()
    for option in sel.options:
        if wanted_norm in option.text.casefold():
            sel.select_by_visible_text(option.text)
            return
    raise RuntimeError(f"No encuentro opción que contenga: {wanted}")


def all_selects(driver):
    return driver.find_elements(By.TAG_NAME, "select")


def click_submit(driver) -> None:
    candidates = driver.find_elements(By.CSS_SELECTOR, "input[type='submit'], button, input[type='button']")
    for el in candidates:
        txt = ((el.get_attribute("value") or "") + " " + (el.text or "")).casefold()
        if any(word in txt for word in ["presup", "buscar", "reserv", "continuar"]):
            el.click()
            return
    raise RuntimeError("No encuentro botón de búsqueda/presupuesto")


def fill_search_form(driver) -> None:
    driver.get(URL)
    wait = WebDriverWait(driver, 30)
    wait.until(EC.presence_of_element_located((By.TAG_NAME, "select")))
    selects = all_selects(driver)
    if len(selects) < 8:
        raise RuntimeError(f"La página tiene menos selects de los esperados: {len(selects)}")

    # En la web aparecen, en orden aproximado: oficina recogida, oficina devolución, día recogida,
    # mes recogida, hora recogida, día devolución, mes devolución, hora devolución.
    select_by_visible_text_contains(selects[0], LOCATION_TEXT)
    select_by_visible_text_contains(selects[1], "Misma Oficina")
    select_by_visible_text_contains(selects[2], PICKUP_DAY)
    select_by_visible_text_contains(selects[3], PICKUP_MONTH_YEAR)
    select_by_visible_text_contains(selects[4], PICKUP_TIME)
    select_by_visible_text_contains(selects[5], RETURN_DAY)
    select_by_visible_text_contains(selects[6], RETURN_MONTH_YEAR)
    select_by_visible_text_contains(selects[7], RETURN_TIME)
    click_submit(driver)


def extract_price_from_page(driver) -> float:
    # Espera a que la página de resultados cargue algo que parezca precio/modelo.
    WebDriverWait(driver, 30).until(lambda d: "€" in d.page_source or "Seat" in d.page_source or "Arona" in d.page_source)
    text = driver.find_element(By.TAG_NAME, "body").text
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    # Busca líneas/cajas cerca del modelo Seat Arona o grupo E.
    candidates = []
    for i, line in enumerate(lines):
        context = "\n".join(lines[max(0, i-4): min(len(lines), i+8)])
        if CAR_TEXT.casefold() in context.casefold() or re.search(rf"\bgrupo\s*{re.escape(CAR_GROUP)}\b", context, re.I):
            for m in re.finditer(r"(\d{1,4}(?:[\.,]\d{2})?)\s*€", context):
                candidates.append(float(m.group(1).replace(".", "").replace(",", ".")))

    if not candidates:
        # Fallback: cualquier precio de la página, útil para depurar.
        for m in re.finditer(r"(\d{1,4}(?:[\.,]\d{2})?)\s*€", text):
            candidates.append(float(m.group(1).replace(".", "").replace(",", ".")))

    if not candidates:
        raise RuntimeError("No he podido encontrar ningún precio en la página de resultados")

    return min(candidates)


def get_current_price() -> float:
    driver = make_driver()
    try:
        fill_search_form(driver)
        return extract_price_from_page(driver)
    finally:
        driver.quit()


def main() -> int:
    state = load_state()
    previous_price = float(state.get("last_price", BASELINE_PRICE))
    lowest_price = float(state.get("lowest_price", BASELINE_PRICE))

    try:
        price = get_current_price()
    except Exception as exc:
        send_telegram(f"⚠️ AutoReisen: no he podido consultar el precio hoy.\nError: {exc}")
        raise

    now = datetime.now().isoformat(timespec="seconds")
    state.setdefault("history", []).append({"date": now, "price": price})
    state["last_price"] = price
    state["lowest_price"] = min(lowest_price, price)
    save_state(state)

    diff_baseline = price - BASELINE_PRICE
    diff_previous = price - previous_price

    if price < previous_price or price < BASELINE_PRICE:
        msg = (
            f"🚨 BAJADA en AutoReisen\n"
            f"Gran Canaria Aeropuerto · Grupo {CAR_GROUP} {CAR_TEXT}\n"
            f"14 Sep 09:00 → 21 Sep 15:00\n\n"
            f"Precio actual: {euro(price)}\n"
            f"Precio anterior: {euro(previous_price)}\n"
            f"Referencia inicial: {euro(BASELINE_PRICE)}\n"
            f"Diferencia vs inicial: {euro(diff_baseline)}\n\n"
            f"Reserva/revisa aquí: {URL}"
        )
        send_telegram(msg)
    elif ALWAYS_NOTIFY:
        msg = (
            f"AutoReisen hoy: {euro(price)}\n"
            f"Sin bajada. Referencia inicial: {euro(BASELINE_PRICE)}.\n"
            f"Diferencia vs ayer: {euro(diff_previous)}\n"
            f"Gran Canaria Aeropuerto · Grupo {CAR_GROUP} {CAR_TEXT}"
        )
        send_telegram(msg)
    else:
        print(f"Precio actual: {price}; sin bajada")

    return 0


if __name__ == "__main__":
    sys.exit(main())
