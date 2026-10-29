/** Streamlit component v1 transport: only sizing/ready, never transmit vector data. */
export function initStreamlitBridge(){
 if(window.parent===window)return
 let parentOrigin='*'
 const send=(type:string,extra:Record<string,unknown>={})=>window.parent.postMessage({isStreamlitMessage:true,type,...extra},parentOrigin)
 let lastHeight=0
 const resize=()=>{const content=document.querySelector('.app-layout');const height=Math.max(900,Math.ceil(content?.scrollHeight||document.body.scrollHeight));if(height!==lastHeight){lastHeight=height;send('streamlit:setFrameHeight',{height})}}
 window.addEventListener('message',event=>{if(event.source!==window.parent||event.data?.type!=='streamlit:render')return;parentOrigin=event.origin;document.documentElement.classList.add('streamlit-embedded');resize()})
 send('streamlit:componentReady',{apiVersion:1});resize()
 const observer=new ResizeObserver(resize);observer.observe(document.querySelector('.app-layout')||document.body)
 window.addEventListener('resize',resize)
}
