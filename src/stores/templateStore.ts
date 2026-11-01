import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { loadJSON, saveJSON } from '../utils/storage'
import type { FunctionProfile, TemplateColumn, TemplateDefinition, TemplateOrigin, TemplateRecord } from '../types'

const LIBRARY_KEY = 'plot-import:v2:template-library'
const OVERRIDE_KEY = 'plot-import:v2:template-overrides'

interface StoredTemplate {
  id: string
  name: string
  description: string
  origin: TemplateOrigin
  updatedAt: string
  definition: TemplateDefinition
}

function isColumn(value: unknown): value is TemplateColumn {
  const column = value as TemplateColumn
  return !!column && typeof column.key === 'string' && typeof column.header === 'string' && typeof column.order === 'number'
}

function isDefinition(value: unknown): value is TemplateDefinition {
  const definition = value as TemplateDefinition
  return !!definition && typeof definition.id === 'string' && Array.isArray(definition.columns) && definition.columns.length > 0 && definition.columns.every(isColumn)
}

function isStored(value: unknown): value is StoredTemplate {
  const stored = value as StoredTemplate
  return !!stored && typeof stored.id === 'string' && typeof stored.name === 'string' && isDefinition(stored.definition)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function normaliseColumns(columns: TemplateColumn[]): TemplateColumn[] {
  return columns.map((column, index) => ({ ...column, order: index + 1 }))
}

export function makeColumnKey(columns: TemplateColumn[]): string {
  const used = new Set(columns.map((column) => column.key))
  let index = columns.length + 1
  let key = `col_${index}`
  while (used.has(key)) key = `col_${++index}`
  return key
}

export const useTemplateStore = defineStore('template-library', () => {
  const builtins = ref<TemplateRecord[]>([])
  const drafts = ref<StoredTemplate[]>([])
  const overrides = ref<Record<string, TemplateDefinition>>({})
  const notice = ref('')

  function persistDrafts() {
    const ok = saveJSON(LIBRARY_KEY, drafts.value)
    if (!ok) notice.value = '浏览器本地存储不可用，模板仅在当前会话有效'
    return ok
  }

  function persistOverrides() {
    const ok = saveJSON(OVERRIDE_KEY, overrides.value)
    if (!ok) notice.value = '浏览器本地存储不可用，模板修改仅在当前会话有效'
    return ok
  }

  function hydrate() {
    const savedDrafts = loadJSON<StoredTemplate[]>(LIBRARY_KEY, (value): value is StoredTemplate[] => Array.isArray(value) && value.every(isStored))
    drafts.value = (savedDrafts || []).map((item) => ({ ...item, definition: clone(item.definition) }))
    const savedOverrides = loadJSON<Record<string, TemplateDefinition>>(OVERRIDE_KEY, (value): value is Record<string, TemplateDefinition> =>
      !!value && typeof value === 'object' && Object.values(value as Record<string, unknown>).every(isDefinition))
    overrides.value = savedOverrides || {}
  }

  hydrate()

  function registerBuiltin(id: string, name: string, description: string, definition: TemplateDefinition) {
    const record: TemplateRecord = {
      id,
      name,
      description,
      builtin: true,
      origin: 'builtin',
      edited: !!overrides.value[id],
      updatedAt: '',
      definition: clone(definition),
    }
    const index = builtins.value.findIndex((item) => item.id === id)
    if (index >= 0) builtins.value[index] = record
    else builtins.value.push(record)
  }

  const records = computed<TemplateRecord[]>(() => [
    ...builtins.value.map((record) => {
      const override = overrides.value[record.id]
      return { ...record, edited: !!override, definition: clone(override || record.definition) }
    }),
    ...drafts.value.map((draft) => ({
      id: draft.id,
      name: draft.name,
      description: draft.description,
      builtin: false,
      origin: draft.origin,
      edited: false,
      updatedAt: draft.updatedAt,
      definition: clone(draft.definition),
    })),
  ])

  const byId = computed(() => Object.fromEntries(records.value.map((record) => [record.id, record])) as Record<string, TemplateRecord>)

  function record(id: string): TemplateRecord | null {
    return byId.value[id] || null
  }

  function definition(id: string): TemplateDefinition | null {
    const found = byId.value[id]
    return found ? clone(found.definition) : null
  }

  function name(id: string): string {
    return byId.value[id]?.name || '自定义模板'
  }

  function profile(id: string): FunctionProfile | null {
    const found = byId.value[id]
    if (!found) return null
    return {
      id: found.id,
      name: found.name,
      description: found.description,
      templateFile: '',
      fieldsFile: '',
      mappingsFile: '',
      dictionaries: { use_l1: [], use_l2: [], areaTolerance: 0.2 },
    }
  }

  function isBuiltin(id: string): boolean {
    return !!builtins.value.find((item) => item.id === id)
  }

  function saveAsTemplate(input: { id?: string | null; name: string; description?: string; definition: TemplateDefinition; origin?: TemplateOrigin }): string {
    const name = input.name.trim()
    if (!name) throw new Error('请填写模板名称')
    const definition = clone(input.definition)
    definition.columns = normaliseColumns(definition.columns)
    if (!definition.columns.length) throw new Error('模板至少需要一个字段')
    const targetId = input.id || `custom-${Date.now().toString(36)}`
    const entry: StoredTemplate = {
      id: targetId,
      name,
      description: (input.description || '').trim(),
      origin: input.origin || 'custom',
      updatedAt: new Date().toISOString(),
      definition,
    }
    const index = drafts.value.findIndex((item) => item.id === targetId)
    if (index >= 0) drafts.value[index] = entry
    else drafts.value.push(entry)
    notice.value = persistDrafts() ? `模板“${name}”已保存，下次打开可直接使用` : '模板已保存到当前会话，但本地存储不可用'
    return targetId
  }

  function updateDefinition(id: string, mutate: (definition: TemplateDefinition) => void): TemplateDefinition | null {
    const found = byId.value[id]
    if (!found) return null
    const draft = clone(found.definition)
    mutate(draft)
    draft.columns = normaliseColumns(draft.columns)
    if (!draft.columns.length) throw new Error('模板至少需要保留一个字段')
    if (isBuiltin(id)) {
      const original = builtins.value.find((item) => item.id === id)!.definition
      if (JSON.stringify(original) === JSON.stringify(draft)) delete overrides.value[id]
      else overrides.value = { ...overrides.value, [id]: draft }
      persistOverrides()
    } else {
      const index = drafts.value.findIndex((item) => item.id === id)
      if (index < 0) return null
      drafts.value[index] = { ...drafts.value[index], definition: draft, updatedAt: new Date().toISOString() }
      persistDrafts()
    }
    return clone(draft)
  }

  function rename(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('模板名称不能为空')
    const index = drafts.value.findIndex((item) => item.id === id)
    if (index < 0) throw new Error('内置模板不能改名，请另存为自定义模板')
    drafts.value[index] = { ...drafts.value[index], name: trimmed, updatedAt: new Date().toISOString() }
    persistDrafts()
    notice.value = `已重命名为“${trimmed}”`
  }

  function remove(id: string) {
    const index = drafts.value.findIndex((item) => item.id === id)
    if (index < 0) return false
    drafts.value.splice(index, 1)
    persistDrafts()
    notice.value = '模板已删除'
    return true
  }

  function resetBuiltin(id: string) {
    if (!overrides.value[id]) return false
    delete overrides.value[id]
    overrides.value = { ...overrides.value }
    persistOverrides()
    notice.value = '已恢复内置模板默认字段'
    return true
  }

  function duplicate(id: string, name?: string): string {
    const found = byId.value[id]
    if (!found) throw new Error('模板不存在')
    return saveAsTemplate({
      name: name || `${found.name} 副本`,
      description: found.description,
      definition: found.definition,
      origin: found.builtin ? 'custom' : found.origin,
    })
  }

  return {
    builtins,
    drafts,
    overrides,
    notice,
    records,
    byId,
    registerBuiltin,
    record,
    definition,
    name,
    profile,
    isBuiltin,
    saveAsTemplate,
    updateDefinition,
    rename,
    remove,
    resetBuiltin,
    duplicate,
  }
})
