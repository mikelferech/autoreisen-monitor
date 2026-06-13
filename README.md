# Monitor AutoReisen + Telegram

Consulta cada día el precio de AutoReisen para:

- Recogida: Gran Canaria - Aeropuerto
- Fechas: 14 septiembre 2026 09:00 → 21 septiembre 2026 15:00
- Coche: Grupo E / Seat Arona
- Precio referencia: 137,03 €

Envía un Telegram todos los días y destaca especialmente si baja.

## 1. Crear bot de Telegram

1. Abre Telegram y busca `@BotFather`.
2. Envía `/newbot`.
3. Ponle nombre y usuario.
4. Copia el token que te da, algo parecido a `123456:ABC...`.

## 2. Obtener tu chat_id

1. Escribe cualquier mensaje a tu nuevo bot.
2. En el navegador abre:

```text
https://api.telegram.org/botTU_TOKEN/getUpdates
```

3. Busca `"chat":{"id":...}` y copia ese número. Ese es tu `TELEGRAM_CHAT_ID`.

## 3. Opción A: instalarlo en tu ordenador

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set TELEGRAM_BOT_TOKEN=TU_TOKEN
set TELEGRAM_CHAT_ID=TU_CHAT_ID
python monitor_autoreisen.py
```

En Mac/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export TELEGRAM_BOT_TOKEN="TU_TOKEN"
export TELEGRAM_CHAT_ID="TU_CHAT_ID"
python monitor_autoreisen.py
```

Para automatizarlo en Windows, usa el Programador de tareas y programa `python monitor_autoreisen.py` una vez al día.

## 4. Opción B: instalarlo gratis en GitHub Actions

1. Crea un repositorio nuevo en GitHub.
2. Sube estos archivos manteniendo la carpeta `.github/workflows/`.
3. En el repositorio ve a `Settings > Secrets and variables > Actions > New repository secret`.
4. Crea estos secretos:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
5. Ve a la pestaña `Actions` y ejecuta manualmente `AutoReisen price monitor` con `Run workflow` para probar.
6. Después se ejecutará todos los días automáticamente.

## Notas

- El script guarda `price_state.json` con el último precio y el histórico.
- Si AutoReisen cambia la estructura de la web, puede hacer falta ajustar los selectores.
- Si quieres que solo avise cuando baje y no todos los días, cambia `ALWAYS_NOTIFY` a `false`.
