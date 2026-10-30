declare module 'xlsx/dist/cpexcel.full.mjs' {
 export const utils: { encode(codepage:number,text:string): number[] | Uint8Array; decode(codepage:number,bytes:Uint8Array):string }
}
