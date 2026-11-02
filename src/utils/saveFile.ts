/** 统一的“保存到本地”入口。
 *
 * 桌面窗口（pywebview）里 `a.download` 点击没有反应，所以壳子注册了
 * `window.pywebview.api.save_file`：这里把 Blob 转成 base64 交给它，由壳子弹
 * 系统“另存为”对话框并落盘；浏览器/网页版仍走原来的下载方式。
 */

export interface SaveResult {
  saved: boolean
  path?: string
  cancelled?: boolean
  error?: string
}

interface NativeReply {
  path?: string
  cancelled?: boolean
  error?: string
}

interface NativeApi {
  save_file(name: string, data: string): Promise<NativeReply> | NativeReply
}

function nativeApi(): NativeApi | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as unknown as { pywebview?: { api?: Partial<NativeApi> } }).pywebview
  const api = bridge?.api
  return api && typeof api.save_file === 'function' ? (api as NativeApi) : null
}

/** 当前是否跑在桌面窗口里（决定下载按钮的提示文案）。 */
export function hasNativeSave(): boolean {
  return nativeApi() !== null
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const step = 0x8000
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step))
  }
  return btoa(binary)
}

export async function saveBlob(blob: Blob, fileName: string): Promise<SaveResult> {
  const api = nativeApi()
  if (api) {
    try {
      const reply = await api.save_file(fileName, await toBase64(blob))
      if (reply && reply.path) return { saved: true, path: reply.path }
      if (reply && reply.error) return { saved: false, error: reply.error }
      return { saved: false, cancelled: true }
    } catch (error) {
      return { saved: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { saved: true }
}

/** 把保存结果变成一句给用户看的话。 */
export function saveMessage(result: SaveResult, fallback = '已开始下载'): string {
  if (result.saved) return result.path ? `已保存到 ${result.path}` : fallback
  if (result.cancelled) return '已取消保存'
  return result.error || '保存失败'
}
