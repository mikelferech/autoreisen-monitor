const toNumber = (value) => Number.parseFloat(String(value ?? 0).replace(',', '.')) || 0;
const receiptMoneyPattern = /-?\d{1,5}(?:[. ]\d{3})*[,.]\d{1,2}/g;

const parseReceiptMoney = (value = '') => {
  let text = String(value || '').replace(/\s/g, '');
  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (text.includes(',')) text = text.replace(',', '.');
  return Number.parseFloat(text) || 0;
};

export function extractLeadingReceiptQuantity(value = '') {
  const text = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  // En los tickets de Mercadona la cantidad aparece al principio sin “x”:
  // “2 CROCAN CHOC VAINILLA 3,00 6,00”. Solo se considera cantidad si
  // después empieza una palabra de al menos tres letras para no alterar
  // marcas como “7 UP” o referencias numéricas cortas.
  const match = text.match(/^(\d{1,3})\s+(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}\b)/);
  if (!match) return { matched:false, quantity:1, name:text };
  return { matched:true, quantity:Math.max(1, Number(match[1]) || 1), name:text.slice(match[0].length).trim() };
}

export function stripReceiptQuantityPrefix(value = '') {
  return extractLeadingReceiptQuantity(value).name;
}

export function parseMercadonaReceiptLine(line = '') {
  const original = String(line || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  const leading = extractLeadingReceiptQuantity(original);
  if (!leading.matched) return null;
  const matches = [...leading.name.matchAll(receiptMoneyPattern)];
  if (!matches.length) return null;

  const last = matches.at(-1);
  const lineTotal = parseReceiptMoney(last[0]);
  if (!(lineTotal > 0) || lineTotal > 5000) return null;

  let unitPrice = 0;
  let nameEnd = last.index;
  if (matches.length >= 2) {
    const previous = matches.at(-2);
    unitPrice = parseReceiptMoney(previous[0]);
    nameEnd = previous.index;
  } else {
    unitPrice = Number((lineTotal / leading.quantity).toFixed(2));
  }

  const name = leading.name.slice(0, nameEnd)
    .replace(/\s{2,}/g, ' ')
    .replace(/^[*·.\-]+|[*·.\-]+$/g, '')
    .trim();
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3}/.test(name) || !(unitPrice > 0)) return null;

  // Evita aceptar como precio unitario una cifra ajena a la línea.
  if (matches.length >= 2 && Math.abs(unitPrice * leading.quantity - lineTotal) > 0.06) return null;

  return {
    name,
    quantity:leading.quantity,
    unitPrice:Number(unitPrice.toFixed(2)),
    price:Number(lineTotal.toFixed(2))
  };
}

export function normalizeLegacyMercadonaReceiptItem(source = {}) {
  const item = { ...source };
  const store = String(item.store || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!store.includes('mercadona')) return item;

  const leading = extractLeadingReceiptQuantity(item.name || '');
  let name = leading.name;
  let quantity = Math.max(0.01, toNumber(item.quantity) || 1);
  let total = Number(toNumber(item.price).toFixed(2));
  let unitPrice = toNumber(item.unitPrice);

  if (leading.matched && quantity <= 1 && leading.quantity > 1) quantity = leading.quantity;

  // Las versiones anteriores podían guardar “2 PRODUCTO 3,00” como nombre,
  // cantidad 1, precio unitario 6,00 y total 6,00. Se recupera el 3,00 del
  // final del nombre cuando coincide con el total y la cantidad detectada.
  const trailing = name.match(/\s+(-?\d{1,5}(?:[. ]\d{3})*[,.]\d{1,2})\s*$/);
  if (trailing && quantity > 1) {
    const candidate = parseReceiptMoney(trailing[1]);
    if (candidate > 0 && Math.abs(candidate * quantity - total) <= 0.06) {
      unitPrice = candidate;
      name = name.slice(0, trailing.index).trim();
    }
  }

  if (!(unitPrice > 0)) unitPrice = total / quantity;
  if (!(total > 0)) total = unitPrice * quantity;
  return {
    ...item,
    name:name.replace(/\s+/g, ' ').trim(),
    quantity:Number(quantity.toFixed(3)),
    unitPrice:Number(unitPrice.toFixed(2)),
    price:Number(total.toFixed(2))
  };
}

export function receiptProductFingerprint(value = '') {
  return stripReceiptQuantityPrefix(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[|]/g, 'i')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\b\d+(?:[,.]\d+)?\s*[xX*]\s*/g, ' ')
    .replace(/^\s*\d{6,}\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ud|uds|unidad|unidades|pack|kg|kilo|g|gr|gramo|l|litro|ml)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function editDistance(a = '', b = '') {
  const x = String(a), y = String(b);
  if (x === y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  const row = Array.from({ length:y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (x[i - 1] === y[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[y.length];
}

export function receiptNamesEquivalent(a = '', b = '') {
  const x = receiptProductFingerprint(a);
  const y = receiptProductFingerprint(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const compactX = x.replace(/\s/g, '');
  const compactY = y.replace(/\s/g, '');
  if (Math.min(compactX.length, compactY.length) >= 7 && (compactX.includes(compactY) || compactY.includes(compactX))) return true;
  const longest = Math.max(compactX.length, compactY.length);
  return longest >= 8 && (1 - editDistance(compactX, compactY) / longest) >= 0.86;
}

export function receiptItemCanBeGrouped(item = {}) {
  const name = String(item.name || '');
  if (!receiptProductFingerprint(name)) return false;
  // Los pesos que forman parte del nombre comercial (p. ej. «160 GR»)
  // no convierten el artículo en una línea de peso variable. La regla de
  // agrupación solicitada es determinista: mismo producto normalizado y
  // mismo precio unitario => una sola fila. Solo se excluyen líneas que no
  // representan productos reales (promociones, descuentos y cupones).
  return !/\b(DESCUENTO|DTO\.?|PROMOCI[ÓO]N|PROMO|OFERTA|2X1|3X2|BONIF(?:ICACI[ÓO]N)?|AHORRO|CUP[ÓO]N|VALE)\b/i.test(name);
}

export function receiptLineTotal(quantity = 0, unitPrice = 0) {
  return Number((Math.max(0, toNumber(quantity)) * Math.max(0, toNumber(unitPrice))).toFixed(2));
}

export function receiptUnitPriceCents(item = {}) {
  const quantity = Math.max(0.01, toNumber(item.quantity) || 1);
  const total = toNumber(item.price);
  const explicitUnit = toNumber(item.unitPrice);
  return Math.round((explicitUnit > 0 ? explicitUnit : total / quantity) * 100);
}

export function receiptItemGroupKey(item = {}, store = '') {
  const fingerprint = receiptProductFingerprint(item.name);
  const unitCents = receiptUnitPriceCents(item);
  const storeKey = String(store || item.store || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
  return `${storeKey}::${fingerprint}::${unitCents}`;
}

export function groupReceiptItems(items = []) {
  const grouped = [];
  const positions = new Map();

  for (const source of items || []) {
    const quantity = Math.max(0.01, toNumber(source?.quantity) || 1);
    const totalPrice = Number(toNumber(source?.price).toFixed(2));
    const item = {
      ...source,
      name: String(source?.name || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim(),
      quantity,
      price: totalPrice,
      groupedLines: Math.max(1, Math.round(toNumber(source?.groupedLines) || 1))
    };

    const fingerprint = receiptProductFingerprint(item.name);
    const unitCents = receiptUnitPriceCents(item);
    if (!receiptItemCanBeGrouped(item) || !fingerprint || unitCents <= 0) {
      grouped.push(item);
      continue;
    }

    const key = `${fingerprint}::${unitCents}`;
    let existingIndex = positions.get(key);
    if (existingIndex === undefined) existingIndex = grouped.findIndex(candidate => receiptItemCanBeGrouped(candidate) && receiptUnitPriceCents(candidate) === unitCents && receiptNamesEquivalent(candidate.name, item.name));
    if (existingIndex === undefined || existingIndex < 0) {
      positions.set(key, grouped.length);
      grouped.push(item);
      continue;
    }

    positions.set(key, existingIndex);
    const existing = grouped[existingIndex];
    existing.quantity = Number((toNumber(existing.quantity) + quantity).toFixed(3));
    existing.price = Number((toNumber(existing.price) + totalPrice).toFixed(2));
    existing.groupedLines = Math.max(1, Math.round(toNumber(existing.groupedLines) || 1)) + item.groupedLines;
    if (item.name.length > String(existing.name || '').length) existing.name = item.name;
  }

  return grouped;
}

export function consolidateStoredTicketItems(items = []) {
  const consolidated = [];
  const positions = new Map();

  const normalizeBreakdown = (source, quantity, totalPrice, unitCents) => {
    const provided = Array.isArray(source?.ticketBreakdown) ? source.ticketBreakdown.filter(Boolean) : [];
    const fallbackTicketId = String(source?.ticketId || source?.sourcePurchaseId || '').trim();
    const fallbackTicketCount = Math.max(1, Math.round(toNumber(source?.ticketCount) || 1));
    const raw = provided.length ? provided : [{
      ticketId:fallbackTicketId,
      date:source?.date || '',
      store:source?.store || '',
      quantity,
      price:totalPrice,
      unitPrice:unitCents / 100,
      label:source?.ticketLabel || '',
      ticketUrl:source?.ticketUrl || '',
      legacy:!fallbackTicketId,
      ticketCount:fallbackTicketCount
    }];
    return raw.map(entry => {
      const q = Math.max(0.01, toNumber(entry?.quantity) || quantity || 1);
      const unit = toNumber(entry?.unitPrice) || (toNumber(entry?.price) / q) || (unitCents / 100);
      const price = toNumber(entry?.price) || receiptLineTotal(q, unit);
      const ticketId = String(entry?.ticketId || fallbackTicketId || '').trim();
      return {
        ticketId,
        date:String(entry?.date || source?.date || ''),
        store:String(entry?.store || source?.store || ''),
        quantity:Number(q.toFixed(3)),
        price:Number(price.toFixed(2)),
        unitPrice:Number(unit.toFixed(2)),
        label:String(entry?.label || source?.ticketLabel || ''),
        ticketUrl:String(entry?.ticketUrl || source?.ticketUrl || ''),
        legacy:Boolean(entry?.legacy) || !ticketId,
        ticketCount:Math.max(1, Math.round(toNumber(entry?.ticketCount) || (ticketId ? 1 : fallbackTicketCount)))
      };
    });
  };

  const ticketCountFor = (breakdown = []) => {
    const ids = new Set();
    let legacyCount = 0;
    for (const entry of breakdown) {
      if (entry?.ticketId && !entry?.legacy) ids.add(entry.ticketId);
      else legacyCount += Math.max(1, Math.round(toNumber(entry?.ticketCount) || 1));
    }
    return Math.max(1, ids.size + legacyCount);
  };

  for (const rawSource of items || []) {
    const source = normalizeLegacyMercadonaReceiptItem(rawSource);
    const quantity = Math.max(0.01, toNumber(source?.quantity) || 1);
    const unitCents = receiptUnitPriceCents({ ...source, quantity });
    const totalPrice = Number((unitCents > 0 ? (unitCents / 100) * quantity : toNumber(source?.price)).toFixed(2));
    const ticketBreakdown = normalizeBreakdown(source, quantity, totalPrice, unitCents);
    const item = {
      ...source,
      quantity,
      price: totalPrice,
      unitPrice: unitCents / 100,
      groupedLines: Math.max(1, Math.round(toNumber(source?.groupedLines) || 1)),
      ticketBreakdown,
      ticketCount: ticketCountFor(ticketBreakdown)
    };

    const fingerprint = receiptProductFingerprint(item.name);
    if (!receiptItemCanBeGrouped(item) || !fingerprint || unitCents <= 0) {
      consolidated.push(item);
      continue;
    }

    const key = receiptItemGroupKey(item, item.store);
    let existingIndex = positions.get(key);
    if (existingIndex === undefined) existingIndex = consolidated.findIndex(candidate => {
      const sameStore = receiptItemGroupKey(candidate, candidate.store).split('::')[0] === key.split('::')[0];
      return sameStore && receiptItemCanBeGrouped(candidate) && receiptUnitPriceCents(candidate) === unitCents && receiptNamesEquivalent(candidate.name, item.name);
    });
    if (existingIndex === undefined || existingIndex < 0) {
      positions.set(key, consolidated.length);
      consolidated.push(item);
      continue;
    }

    positions.set(key, existingIndex);
    const existing = consolidated[existingIndex];
    existing.quantity = Number((toNumber(existing.quantity) + quantity).toFixed(3));
    existing.price = Number((toNumber(existing.price) + totalPrice).toFixed(2));
    existing.unitPrice = unitCents / 100;
    existing.groupedLines = Math.max(1, Math.round(toNumber(existing.groupedLines) || 1)) + item.groupedLines;
    existing.ticketBreakdown = [...(Array.isArray(existing.ticketBreakdown) ? existing.ticketBreakdown : []), ...ticketBreakdown];
    existing.ticketCount = ticketCountFor(existing.ticketBreakdown);
    if (String(item.date || '') > String(existing.date || '')) existing.date = item.date;
    if (String(item.name || '').length > String(existing.name || '').length) existing.name = item.name;
  }

  return consolidated;
}

export function mergeReceiptItemsIntoProducts(products = [], incomingItems = [], createId = () => `product-${Date.now()}`) {
  const merged = [];
  const positions = new Map();

  const add = (source, incoming = false) => {
    const quantity = Math.max(0.01, toNumber(source?.quantity) || 1);
    const name = String(source?.name || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    const unitCents = incoming ? receiptUnitPriceCents(source) : Math.round(toNumber(source?.unitPrice) * 100);
    const fingerprint = receiptProductFingerprint(name);
    const key = receiptItemCanBeGrouped({ name, quantity, price:(unitCents / 100) * quantity }) && fingerprint && unitCents > 0
      ? `${fingerprint}::${unitCents}`
      : '';

    let existingIndex = key ? positions.get(key) : undefined;
    if (existingIndex === undefined && key) existingIndex = merged.findIndex(candidate => Math.round(toNumber(candidate.unitPrice) * 100) === unitCents && receiptNamesEquivalent(candidate.name, name));
    if (existingIndex !== undefined && existingIndex >= 0) {
      const existing = merged[existingIndex];
      existing.quantity = Number((toNumber(existing.quantity) + quantity).toFixed(3));
      if (incoming) existing.checked = true;
      positions.set(key, existingIndex);
      return;
    }

    const product = incoming
      ? { id:createId(), name, quantity, unit:'ud.', unitPrice:unitCents / 100, checked:true, url:'', imageUrl:'' }
      : { ...source, name, quantity, unit:source?.unit || 'ud.', unitPrice:unitCents / 100 };
    if (key) positions.set(key, merged.length);
    merged.push(product);
  };

  for (const product of products || []) add(product, false);
  for (const item of incomingItems || []) add(item, true);
  return merged;
}
