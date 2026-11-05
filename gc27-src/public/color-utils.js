export function isHexColor(value) {
  return /^#?[0-9a-f]{6}$/i.test(String(value ?? '').trim());
}

export function normalizeHexColor(value, fallback = '#000000') {
  let raw = String(value ?? '').trim().toUpperCase();
  if (!raw.startsWith('#')) raw = `#${raw}`;
  if (/^#[0-9A-F]{3}$/.test(raw)) {
    raw = `#${raw.slice(1).split('').map(char => char + char).join('')}`;
  }
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;

  let safeFallback = String(fallback ?? '#000000').trim().toUpperCase();
  if (!safeFallback.startsWith('#')) safeFallback = `#${safeFallback}`;
  if (/^#[0-9A-F]{3}$/.test(safeFallback)) {
    safeFallback = `#${safeFallback.slice(1).split('').map(char => char + char).join('')}`;
  }
  return /^#[0-9A-F]{6}$/.test(safeFallback) ? safeFallback : '#000000';
}
