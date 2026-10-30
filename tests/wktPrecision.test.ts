import {it,expect} from 'vitest'
import {roundWkt,roundWktRows} from '../src/utils/wktPrecision'
import {makeCSVBytes} from '../src/utils/tableExport'
import {makeVillageArchive} from '../src/utils/villageExcel'
import {makeWorkbook} from '../src/utils/excel'
import {unzipSync} from 'fflate'
import type {TemplateDefinition} from '../src/types'
const template:TemplateDefinition={id:'x',version:'1',sheetName:'村',headerRows:1,columns:[{key:'geom_wkt',header:'坐标集',group:'basic',order:1,dataType:'string'}]}
it('坐标舍入到六位，保留多面、洞、SRID、科学计数法与环闭合',()=>{
 expect(roundWkt('SRID=4326;MULTIPOLYGON (((112.12345678 -0.00000001,1e-7 22.9876546,112.12345678 -0.00000001)))')).toBe('SRID=4326;MULTIPOLYGON (((112.123457 0,0 22.987655,112.123457 0)))')
 expect(roundWkt(null)).toBeNull();expect(roundWkt('001234567890')).toBe('001234567890')
})
it('普通CSV、Excel及各村ZIP使用相同精度，原始属性保持不变',()=>{
 const input=[{rowId:'1',plot_code:'001',geom_wkt:'POLYGON ((112.12345678 22,113 22,113 23,112.12345678 22))'}]
 const rows=roundWktRows(input)
 expect(input[0].geom_wkt).toContain('112.12345678');expect(rows[0].plot_code).toBe('001')
 const bytes=makeCSVBytes(rows,template,'gbk');expect(new TextDecoder('gbk').decode(bytes)).toContain('112.123457')
 expect(makeWorkbook(rows,template,'single').Sheets['村'].A2.v).toBe(rows[0].geom_wkt)
 const zip=unzipSync(makeVillageArchive([{key:'1',name:'村',fileStem:'村',rows,featureIds:['1']}],template,'csv','gbk'));expect(zip['村.csv']).toEqual(bytes)
})
