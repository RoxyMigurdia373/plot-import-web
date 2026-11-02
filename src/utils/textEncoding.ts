/**
 * 文本类数据（CSV / TXT）的字节解码。
 *
 * 浏览器与 SheetJS 默认按 UTF-8 或 latin1 处理，国内导出的 CSV 常常是 GBK/GB18030，
 * 直接按 UTF-8 解就会得到一串「æ°´ç”°」这样的乱码。这里先按 BOM 判断，再严格试
 * UTF-8，失败后退到 GB18030（GBK 的超集），保证中文表头与属性值都能正确显示。
 */

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030'

export interface DecodedText {
  text: string
  encoding: TextEncoding
}

function decode(bytes: Uint8Array, label: string, fatal: boolean): string {
  return new TextDecoder(label, { fatal }).decode(bytes)
}

function tryDecode(bytes: Uint8Array, label: string): string | null {
  try {
    return decode(bytes, label, true)
  } catch {
    return null
  }
}

/** 识别 BOM，返回去掉 BOM 的正文与编码名。 */
function sniffBom(bytes: Uint8Array): { body: Uint8Array; encoding: TextEncoding } | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { body: bytes.subarray(3), encoding: 'utf-8' }
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { body: bytes.subarray(2), encoding: 'utf-16le' }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { body: bytes.subarray(2), encoding: 'utf-16be' }
  }
  return null
}

export function decodeTableBytes(buffer: ArrayBuffer | Uint8Array): DecodedText {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const bom = sniffBom(bytes)
  if (bom) {
    const text = decode(bom.body, bom.encoding, false)
    return { text, encoding: bom.encoding }
  }
  const utf8 = tryDecode(bytes, 'utf-8')
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' }
  for (const label of ['gb18030', 'gbk']) {
    const decoded = tryDecode(bytes, label)
    if (decoded !== null) return { text: decoded, encoding: 'gb18030' }
  }
  return { text: decode(bytes, 'utf-8', false), encoding: 'utf-8' }
}

/** 读 CSV / TXT 文件，按 BOM → UTF-8 → GB18030 的顺序解码。 */
export async function readTextFile(file: File): Promise<DecodedText> {
  return decodeTableBytes(await file.arrayBuffer())
}

export function encodingLabel(encoding: TextEncoding): string {
  switch (encoding) {
    case 'utf-8':
      return 'UTF-8'
    case 'utf-16le':
    case 'utf-16be':
      return 'UTF-16'
    case 'gb18030':
      return 'GBK/GB18030'
  }
}
