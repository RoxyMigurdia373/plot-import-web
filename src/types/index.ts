import type { FeatureCollection, Geometry } from 'geojson'
export type CellValue = string | number | boolean | null
export type FieldGroup = 'basic' | 'confirm' | 'ext'
export type QualityLevel = 'block' | 'warn' | 'info'
export interface FieldLevel { key: string; field: string; group: FieldGroup; vectorRequirement: 'required' | 'recommended' | 'optional'; derivable: boolean; defaultable: boolean; defaultValue: CellValue; manualFill: boolean; allowEmpty: boolean; platformRequired: 'yes' | 'no' | 'unknown'; requiredWhen?: {field: string; equals: CellValue}; note?: string }
export interface MappingSuggestion { id: string; rawField: string; recommendedTarget: string | null; selectedTarget: string | null; confidence: number; reason: string; needConfirm: boolean; status: 'auto' | 'confirmed' | 'rejected' }
export interface QualityIssue { id: string; rowId: string; row: number; plotCode: string | null; fieldKey?: string; ruleId: string; type: string; level: QualityLevel; desc: string; suggest: string; status: 'open' | 'acknowledged' | 'resolved' }
export interface TemplateColumn { key: string; header: string; group: FieldGroup; order: number; dataType: 'string' | 'number' | 'date' }
export interface TemplateDefinition { id: string; version: string; sheetName: string; headerRows: number; columns: TemplateColumn[] }
export interface RawField { name: string; alias: string; sample: CellValue; type: string; unit?: string }
export interface TaskInfo { taskId: string; projectId: string; fileName: string; fileSize: number; crs: string; plotCount: number; synthetic: boolean; createdAt: string; templateId: string }
export interface PlotProperties { rowId: string; [key: string]: unknown }
export type PlotCollection = FeatureCollection<Geometry | null, PlotProperties>
export interface DataRow { rowId: string; plot_code: string | null; [key: string]: CellValue }
export type BasicRow = DataRow
export type ConfirmRow = DataRow
export type ExtRow = DataRow
export interface FieldProvenance { kind: 'raw' | 'derived' | 'default' | 'manual'; sourceField?: string; explanation?: string }
export interface FailedRow { rowId: string; row: number; plotCode: string | null; reason: string; suggest: string }
export interface UploadResult { id: string; simulated: true; total: number; success: number; failed: number; failedRows: FailedRow[]; snapshot: DataRow[]; createdAt: string }
export interface Dictionaries { use_l1: string[]; use_l2: string[]; areaTolerance: number }
export interface FunctionProfile { id: string; name: string; description: string; templateFile: string; fieldsFile: string; mappingsFile: string; dictionaries: Dictionaries }
