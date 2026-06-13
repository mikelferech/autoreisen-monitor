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

LOCATION_TEXT = os.getenv("LOCATION_TEXT", "Gran Canaria - Aeropuerto")
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
        json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "disable_web_page_preview": True,
        },
        timeout=30,
    )
    resp.raise_for_status()


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))

    return {
        "last_price": BASELINE_PRICE,
        "lowest_price": BASELINE_PRICE,
        "history": [],
    }


def save_state(state: dict) -> None:
    STATE_FILE.write_text(
        json.dumps(state, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def make_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1600,1200")
    options.add_argument("--lang=es-ES")
    return webdriver.Chrome(options=options)


def accept_cookies_if_present(driver) -> None:
    time.sleep(2)

    candidates = driver.find_elements(By.TAG_NAME, "button")
    candidates += driver.find_elements(
        By.CSS_SELECTOR,
        "input[type='button'], input[type='submit'], a",
    )

    for el in candidates:
        txt = ((el.text or "") + " " + (el.get_attribute("value") or "")).casefold()
        if "permitir todas" in txt or "aceptar" in txt:
            try:
                driver.execute_script("arguments[0].click();", el)
                time.sleep(1)
                return
            except Exception:
                pass


def all_selects(driver):
    return driver.find_elements(By.TAG_NAME, "select")


def select_by_visible_text_contains(select_el, wanted: str) -> None:
    sel = Select(select_el)
    wanted_norm = wanted.casefold().strip()

    for option in sel.options:
        option_text = option.text.strip()
        if wanted_norm in option_text.casefold():
            sel.select_by_visible_text(option_text)
            return

    print("Opciones disponibles:")
    for option in sel.options:
        print("-", option.text)

    raise RuntimeError(f"No encuentro opción que contenga: {wanted}")


def select_has_option(select_el, wanted: str) -> bool:
    wanted_norm = wanted.casefold().strip()
    return any(wanted_norm in o.text.casefold().strip() for o in Select(select_el).options)


def select_has_exact_option(select_el, wanted: str) -> bool:
    wanted_norm = wanted.casefold().strip()
    return any(wanted_norm == o.text.casefold().strip() for o in Select(select_el).options)


def find_location_select(driver):
    matches = [s for s in all_selects(driver) if select_has_option(s, LOCATION_TEXT)]
    if not matches:
        raise RuntimeError("No encuentro desplegable de oficina de recogida")
    return matches[0]


def find_return_location_select(driver, pickup_select):
    matches = [s for s in all_selects(driver) if select_has_option(s, "Misma Oficina")]
    matches = [s for s in matches if s.id != pickup_select.id]

    if not matches:
        raise RuntimeError("No encuentro desplegable de oficina de devolución")

    return matches[0]


def find_date_time_selects(driver):
    selects = all_selects(driver)

    location_selects = [
        s for s in selects
        if select_has_option(s, "Gran Canaria - Aeropuerto") or select_has_option(s, "Misma Oficina")
    ]

    usable = [s for s in selects if all(s.id != loc.id for loc in location_selects)]

    day_selects = [
        s for s in usable
        if select_has_exact_option(s, "14") and select_has_exact_option(s, "21") and select_has_exact_option(s, "31")
    ]

    month_selects = [
        s for s in usable
        if select_has_exact_option(s, PICKUP_MONTH_YEAR)
    ]

    time_selects = [
        s for s in usable
        if select_has_exact_option(s, "09:00") and select_has_exact_option(s, "15:00") and select_has_exact_option(s, "23:59")
    ]

    if len(day_selects) < 2 or len(month_selects) < 2 or len(time_selects) < 2:
        raise RuntimeError(
            f"No encuentro selects suficientes. "
            f"días={len(day_selects)}, meses={len(month_selects)}, horas={len(time_selects)}"
        )

    return day_selects, month_selects, time_selects


def click_submit(driver) -> None:
    forms = driver.find_elements(By.TAG_NAME, "form")

    target_form = None
    for form in forms:
        action = form.get_attribute("action") or ""
        if "tarifas-flota.php" in action:
            target_form = form
            break

    if target_form is None:
        raise RuntimeError(f"No encuentro el formulario de tarifas. Formularios: {len(forms)}")

    print("Enviando formulario:")
    print("action:", target_form.get_attribute("action"))
    print("method:", target_form.get_attribute("method"))

    driver.execute_script("arguments[0].submit();", target_form)
    time.sleep(5)

    # Pantalla intermedia de Gran Canaria con botón Continuar
    for _ in range(10):
        body = driver.find_element(By.TAG_NAME, "body").text.casefold()

        if "e - seat arona" in body or "seat arona" in body:
            return

        candidates = driver.find_elements(
            By.CSS_SELECTOR,
            "a, button, input[type='button'], input[type='submit']",
        )

        for el in candidates:
            txt = ((el.text or "") + " " + (el.get_attribute("value") or "")).casefold()
            if "continuar" in txt:
                driver.execute_script("arguments[0].click();", el)
                time.sleep(5)
                return

        time.sleep(1)


def fill_search_form(driver) -> None:
    driver.get(URL)
    accept_cookies_if_present(driver)

    wait = WebDriverWait(driver, 30)
    wait.until(EC.presence_of_element_located((By.TAG_NAME, "select")))

    pickup_location = find_location_select(driver)
    select_by_visible_text_contains(pickup_location, LOCATION_TEXT)
    time.sleep(1)

    return_location = find_return_location_select(driver, pickup_location)
    select_by_visible_text_contains(return_location, "Misma Oficina")
    time.sleep(1)

    day_selects, month_selects, time_selects = find_date_time_selects(driver)

    select_by_visible_text_contains(day_selects[0], PICKUP_DAY)
    select_by_visible_text_contains(month_selects[0], PICKUP_MONTH_YEAR)
    select_by_visible_text_contains(time_selects[0], PICKUP_TIME)

    select_by_visible_text_contains(day_selects[1], RETURN_DAY)
    select_by_visible_text_contains(month_selects[1], RETURN_MONTH_YEAR)
    select_by_visible_text_contains(time_selects[1], RETURN_TIME)

    print("Valores seleccionados:")
    print("OFICINA:", Select(pickup_location).first_selected_option.text)
    print("DEVOLUCION:", Select(return_location).first_selected_option.text)
    print("RECOGIDA DIA:", Select(day_selects[0]).first_selected_option.text)
    print("RECOGIDA MES:", Select(month_selects[0]).first_selected_option.text)
    print("RECOGIDA HORA:", Select(time_selects[0]).first_selected_option.text)
    print("DEV DIA:", Select(day_selects[1]).first_selected_option.text)
    print("DEV MES:", Select(month_selects[1]).first_selected_option.text)
    print("DEV HORA:", Select(time_selects[1]).first_selected_option.text)

    click_submit(driver)


def extract_price_from_page(driver) -> float:
    WebDriverWait(driver, 30).until(lambda d: "€" in d.page_source)

    text = driver.find_element(By.TAG_NAME, "body").text
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    print("URL resultados:", driver.current_url)

    for i, line in enumerate(lines):
        if "e - seat arona" in line.casefold():
            context = "\n".join(lines[i:i + 10])
            print("Contexto Grupo E / Arona:")
            print(context)

            prices = []
            for m in re.finditer(r"(\d{1,4}(?:[\.,]\d{2})?)\s*€", context):
                price = float(m.group(1).replace(".", "").replace(",", "."))
                prices.append(price)

            valid_prices = [p for p in prices if 100 <= p <= 250]

            if valid_prices:
                return min(valid_prices)

    print("Texto resultados:")
    print(text[:5000])
    raise RuntimeError("No he podido encontrar el precio del Grupo E / Seat Arona")


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
        send_telegram(
            f"⚠️ AutoReisen: no he podido consultar el precio hoy.\n"
            f"Error: {exc}"
        )
        raise

    now = datetime.now().isoformat(timespec="seconds")

    state.setdefault("history", []).append(
        {
            "date": now,
            "price": price,
        }
    )

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
