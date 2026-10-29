import type { FunctionProfile } from '../types'
export const functions: FunctionProfile[] = [
 {id:'full-plot',name:'全量地块导入',description:'地块基本信息、确权与扩展字段，按全量模板导出。',templateFile:'template-columns.json',fieldsFile:'field-levels.json',mappingsFile:'mapping-suggest.json',dictionaries:{use_l1:['A','B','C'],use_l2:['A01','B03','C01'],areaTolerance:.2}},
 {id:'land-classification',name:'土地用地分类',description:'区块编码、用地分类与边界，按12列分类模板导出。',templateFile:'templates/land-classification.json',fieldsFile:'templates/land-classification-fields.json',mappingsFile:'templates/land-classification-mapping.json',dictionaries:{use_l1:['DEMO-L1'],use_l2:['DEMO-L101','DEMO-L102'],areaTolerance:.2}},
 {id:'crop-recognition',name:'作物识别导入',description:'已有作物属性与五级标的字段映射，按8列模板导出。',templateFile:'templates/crop-recognition.json',fieldsFile:'templates/crop-recognition-fields.json',mappingsFile:'templates/crop-recognition-mapping.json',dictionaries:{use_l1:[],use_l2:[],areaTolerance:.2}},
 {id:'village-boundary',name:'村界导入',description:'按0325村界模板映射22个字段，每村独立导出一张表。',templateFile:'templates/village-boundary.json',fieldsFile:'templates/village-boundary-fields.json',mappingsFile:'templates/village-boundary-mapping.json',dictionaries:{use_l1:[],use_l2:[],areaTolerance:.2}}
]
export const profileStorageKey = (id:string,section:string) => `plot-import:v1:synthetic-village:${id}:0322:${section}`
