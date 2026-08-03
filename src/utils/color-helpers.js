/** Pure date helpers — expand in later phases. */
export function isValidHex(color) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}
