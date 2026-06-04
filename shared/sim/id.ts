// Portable unique-id source for the shared simulation. Works in both Node
// (18+) and secure-context browsers, where `crypto.randomUUID` is a global.
// Typed locally so this file needs neither the DOM nor @types/node lib.
const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

export function randomId(): string {
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  // Fallback for any environment without crypto.randomUUID — good enough for
  // entity ids within a single match.
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
