// Portable unique-id source for the shared simulation. Works in both Node
// (18+) and secure-context browsers, where `crypto.randomUUID` is a global.
// Typed locally so this file needs neither the DOM nor @types/node lib.
const cryptoObj = (
  globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (arr: Uint8Array) => Uint8Array;
    };
  }
).crypto;

export function randomId(): string {
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();

  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return (
      "id-" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  throw new Error("Secure random number generation is not supported in this environment.");
}
