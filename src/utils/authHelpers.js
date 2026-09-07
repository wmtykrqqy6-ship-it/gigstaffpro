// PBKDF2-SHA256 with a random per-PIN salt and a high iteration count.
// Stored as "pbkdf2$<iterations>$<saltHex>$<hashHex>" so api/worker-pin-login.js
// (which mirrors this — see its header comment) can tell it apart from a
// legacy unsalted-SHA256 hex hash (exactly 64 hex chars, no "$") and keep
// verifying old rows while it transparently upgrades them on next login.
//
// A per-PIN salt alone wouldn't meaningfully protect a leaked pin_hash: a
// 4-digit PIN only has 10,000 possibilities, trivial to brute-force per row
// in milliseconds with a fast hash even once the salt is known. The
// iteration count is what actually raises the cost of that per-row attack —
// the salt's job is only to stop reusing one precomputed table across every
// leaked row at once.
const PBKDF2_ITERATIONS = 100000;

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex) =>
  new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));

// existingSalt (hex string) lets verifyPin() recompute a hash under the
// same salt as a stored one, for comparison.
export const hashPin = async (pin, existingSalt = null) => {
  if (!pin) return '';

  const encoder = new TextEncoder();
  const salt = existingSalt ? fromHex(existingSalt) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(derivedBits)}`;
};

// True if `pin` matches a hash previously produced by hashPin() above.
// Returns false (not an error) for a hash in some other/legacy format —
// callers that need to also accept legacy unsalted-SHA256 hashes handle
// that format themselves (see api/worker-pin-login.js).
export const verifyPin = async (pin, storedHash) => {
  if (!pin || !storedHash) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const [, , saltHex] = parts;
  const recomputed = await hashPin(pin, saltHex);
  return recomputed === storedHash;
};
