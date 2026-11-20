export type CameraPermission = 'granted' | 'denied' | 'prompt'

/** 不是每個瀏覽器都能查相機權限（例如 Firefox）；查不到一律當成還沒問過。 */
export async function queryCameraPermission(): Promise<CameraPermission> {
  try {
    const permissions = navigator.permissions as Permissions | undefined
    if (!permissions) return 'prompt'
    const { state } = await permissions.query({ name: 'camera' as PermissionName })
    return state === 'granted' || state === 'denied' ? state : 'prompt'
  } catch {
    return 'prompt'
  }
}
