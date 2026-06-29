"use strict";

function stripKnownHexPrefix(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text.startsWith("0x") || text.startsWith("0:")) return text.slice(2);
  return text;
}

function normalizeComparableUint256(value) {
  let text = stripKnownHexPrefix(value);
  if (!text) return "";

  try {
    if (/^[0-9a-f]+$/.test(text) && (/[a-f]/.test(text) || text.length === 64)) {
      return BigInt(`0x${text}`).toString(16).padStart(64, "0");
    }
    if (/^[0-9]+$/.test(text)) return BigInt(text).toString(16).padStart(64, "0");
  } catch (_err) {
    return text;
  }

  return text;
}

function comparableUint256Equals(left, right) {
  const normalizedLeft = normalizeComparableUint256(left);
  const normalizedRight = normalizeComparableUint256(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function findComparableMapValue(map, expectedKey) {
  if (!map || typeof map !== "object") return { key: "", value: "" };
  for (const [key, value] of Object.entries(map)) {
    if (comparableUint256Equals(key, expectedKey)) return { key, value };
  }
  return { key: "", value: "" };
}

module.exports = {
  comparableUint256Equals,
  findComparableMapValue,
  normalizeComparableUint256,
  stripKnownHexPrefix,
};

