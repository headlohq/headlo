export async function verifyComponentCode(code: string, signature: string, publicKeyJwk: JsonWebKey | null): Promise<boolean> {
  if (!publicKeyJwk) {
    console.warn('[headlo] No public key configured — skipping component signature verification')
    return true
  }
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'Ed25519' }, false, ['verify'])
  } catch (e) {
    // Safari < 17 does not support Ed25519 in Web Crypto — skip verification rather than block all components
    if (e instanceof Error && (e.name === 'NotSupportedError' || e.name === 'DataError')) {
      console.warn('[headlo] Ed25519 not supported in this browser — skipping signature verification')
      return true
    }
    return false
  }
  try {
    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0))
    return await crypto.subtle.verify('Ed25519', key, sigBytes, new TextEncoder().encode(code))
  } catch {
    return false
  }
}
