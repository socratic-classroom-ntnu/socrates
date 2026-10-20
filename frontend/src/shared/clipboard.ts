// 複製文字到剪貼簿。navigator.clipboard 在部分內嵌瀏覽器（例如桌面 app 的瀏覽器窗格）
// 會被擋、拒絕或一直不回應；這時改用隱藏 textarea＋execCommand('copy')。回傳是否真的複製成功。
const CLIPBOARD_TIMEOUT_MS = 1500

function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '0'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(area)
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), CLIPBOARD_TIMEOUT_MS)),
      ])
      return true
    } catch {
      // 落到 textarea 備援
    }
  }
  return copyWithTextarea(text)
}
