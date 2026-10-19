export async function loadVerifiedAvatarFixture(
  name: string,
  expectedSha256: string,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const response = await fetch(`/avatar-fixtures/coffee-shop/${name}`, {
    signal,
    credentials: 'same-origin',
  })
  if (!response.ok) throw Error(`RECORDED_ASSET_UNAVAILABLE:${name}`)
  const bytes = await response.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (hex !== expectedSha256) throw Error(`RECORDED_ASSET_DIGEST_MISMATCH:${name}`)
  return bytes
}
