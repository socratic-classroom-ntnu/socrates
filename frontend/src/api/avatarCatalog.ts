// 導師人像的模型清單（靜態檔 /avatar-packs/catalog.json，由 Portal 的 avatar-serve 產生）。
export type AvatarPack = {
  id: string
  name: string
  products?: string[]
  license?: string
  model_sha256: string
  camera_preset?: { zoom?: number; lift?: number; framing?: string }
  [key: string]: unknown
}

/** CE 必須明列產品資格；缺少 products 的既有 pack 只允許 Socratic。 */
export const permitsProduct = (pack: AvatarPack, product: 'socratic' | 'ce') =>
  product === 'ce' ? pack.products?.includes('ce') === true : !pack.products || pack.products.includes(product)

export async function loadAvatarCatalog(signal?: AbortSignal): Promise<AvatarPack[]> {
  const response = await fetch('/avatar-packs/catalog.json', { signal, credentials: 'same-origin' })
  if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) throw Error('AVATAR_CATALOG_UNAVAILABLE')
  const catalog = await response.json()
  if (!Array.isArray(catalog?.packs)) throw Error('AVATAR_CATALOG_UNAVAILABLE')
  return catalog.packs
}

/** 模型檔（GLB）原始位元組；呼叫端自行核對 catalog 給的 SHA-256。 */
export async function loadAvatarModel(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path, { credentials: 'same-origin' })
  if (!response.ok) throw Error('MODEL_HTTP_' + response.status)
  return response.arrayBuffer()
}
