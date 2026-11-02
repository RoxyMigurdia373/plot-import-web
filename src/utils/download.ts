import { saveBlob } from './saveFile'
import type { SaveResult } from './saveFile'

export function downloadJSON(value: unknown, fileName: string): Promise<SaveResult> {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/geo+json;charset=utf-8' })
  return saveBlob(blob, fileName)
}
