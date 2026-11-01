/**
 * 导入与检查上限。
 *
 * 网页版和本地 EXE 的内存预算不同：本地 EXE 由 Windows 进程独占内存，可以放开到
 * 百万级要素；GitHub Pages 上的网页版仍按浏览器通用内存保守限制。桌面壳打开页面时
 * 带 `?local=1` 参数，页面按本地预算工作；也可以用 `window.__PLOT_IMPORT_LIMITS__`
 * 覆盖单项（自动化测试用）。
 */

export type LimitProfile = 'web' | 'desktop'

export interface ImportLimits {
  profile: LimitProfile
  /** 单个文件（SHP 为同名文件合计）允许的最大字节数 */
  maxFileBytes: number
  /** 一次处理的要素/表格数据行上限 */
  maxFeatures: number
  /** 拓扑检查超时，超过就提示分批处理，不把未检查当成通过 */
  timeoutMs: number
}

const WEB_LIMITS: ImportLimits = {
  profile: 'web',
  maxFileBytes: 200 * 1024 * 1024,
  maxFeatures: 200_000,
  timeoutMs: 120_000,
}

const DESKTOP_LIMITS: ImportLimits = {
  profile: 'desktop',
  maxFileBytes: 2 * 1024 * 1024 * 1024,
  maxFeatures: 1_000_000,
  timeoutMs: 900_000,
}

function queryProfile(): LimitProfile | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const mode = (params.get('limits') || params.get('mode') || '').toLowerCase()
  if (mode === 'desktop' || mode === 'local') return 'desktop'
  if (mode === 'web') return 'web'
  if (params.get('local') === '1') return 'desktop'
  return null
}

function override(): Partial<ImportLimits> {
  if (typeof window === 'undefined') return {}
  const value = (window as unknown as { __PLOT_IMPORT_LIMITS__?: Partial<ImportLimits> }).__PLOT_IMPORT_LIMITS__
  return value && typeof value === 'object' ? value : {}
}

function resolve(): ImportLimits {
  const base = queryProfile() === 'desktop' ? DESKTOP_LIMITS : WEB_LIMITS
  const patch = override()
  return {
    profile: base.profile,
    maxFileBytes: positive(patch.maxFileBytes, base.maxFileBytes),
    maxFeatures: positive(patch.maxFeatures, base.maxFeatures),
    timeoutMs: positive(patch.timeoutMs, base.timeoutMs),
  }
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

export const limits: ImportLimits = resolve()

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${trim(bytes / 1024 ** 3)} GB`
  if (bytes >= 1024 ** 2) return `${trim(bytes / 1024 ** 2)} MB`
  if (bytes >= 1024) return `${trim(bytes / 1024)} KB`
  return `${Math.round(bytes)} B`
}

export function formatCount(count: number): string {
  if (count >= 10_000) return `${trim(count / 10_000)} 万`
  return String(count)
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(value < 10 ? 1 : 0)
}

/** 上传页文案：把当前预算写清楚，避免用户按旧文案自我设限。 */
export const limitSummary = `最多 ${formatCount(limits.maxFeatures)}要素 / ${formatBytes(limits.maxFileBytes)}`

/** 超过这个规模就提示处理时间较长（不阻断，只是提前打招呼）。 */
export const bulkyFeatures = Math.max(20_000, Math.floor(limits.maxFeatures / 5))
