import { checkTopology } from '../services/topology'
self.onmessage=e=>{
 try{
  let last=-1
  const report=checkTopology(e.data,(percent:number)=>{
   const rounded=Math.min(99,Math.max(0,Math.round(percent)))
   if(rounded===last)return
   last=rounded
   self.postMessage({progress:rounded})
  })
  self.postMessage({report})
 }catch(error){self.postMessage({error:String(error)})}
}
