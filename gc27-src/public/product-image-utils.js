const WEB_IMAGE_RE = /^https?:\/\//i;
const EMBEDDED_IMAGE_RE = /^(?:data:image\/|blob:)/i;

export function inferProductImageSource(product = {}) {
  const explicit = String(product.imageSource || "").toLowerCase();
  if (explicit === "manual" || explicit === "auto") return explicit;
  const imageUrl = String(product.imageUrl || "").trim();
  if (!imageUrl) return "auto";
  if (EMBEDDED_IMAGE_RE.test(imageUrl)) return "manual";
  // Antes de v2.1.18, las imágenes encontradas por el actualizador se
  // guardaban en imageUrl sin indicar su origen. priceUpdatedAt permite
  // reconocer esos registros y migrarlos al modo automático.
  if (product.priceUpdatedAt && WEB_IMAGE_RE.test(imageUrl) && product.url) return "auto";
  return "manual";
}

export function normalizeProductImageFields(product = {}) {
  return {
    ...product,
    imageSource: inferProductImageSource(product)
  };
}

export function mergeAutomaticProductImage(product = {}, workerImage = "") {
  const current = normalizeProductImageFields(product);
  const candidate = String(workerImage || "").trim();
  if (current.imageSource === "manual" && current.imageUrl) return current;
  if (!candidate) return current;
  return {
    ...current,
    imageUrl: candidate,
    imageSource: "auto"
  };
}

export function applyManualProductImage(product = {}, imageUrl = "") {
  const value = String(imageUrl || "").trim();
  return {
    ...product,
    imageUrl: value,
    imageSource: value ? "manual" : "auto"
  };
}

export function productUsesAutomaticImage(product = {}) {
  return inferProductImageSource(product) === "auto" && Boolean(String(product.url || "").trim());
}
