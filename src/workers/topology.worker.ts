import { checkTopology } from '../services/topology'
self.onmessage=e=>{try{self.postMessage({report:checkTopology(e.data)})}catch(error){self.postMessage({error:String(error)})}}
