// crypto.randomUUID() is spec'd to only exist in "secure contexts" (HTTPS or
// localhost) -- it throws/is undefined over plain HTTP, e.g. testing on a
// phone via a LAN IP like http://10.0.0.5:5173 before this is deployed
// anywhere with real HTTPS. crypto.getRandomValues() has no such
// restriction, so fall back to building an RFC 4122 v4 UUID from it (Math.
// random as a last resort if even that's missing) rather than crashing.
export function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [hex.slice(0, 4).join(""), hex.slice(4, 6).join(""), hex.slice(6, 8).join(""), hex.slice(8, 10).join(""), hex.slice(10, 16).join("")].join(
    "-",
  );
}
