import { useEffect, useRef, useState } from 'react';
import { Card } from '../../components/ui.tsx';

export interface LetterPreviewData { readonly pagesHtml:string; readonly pageCount:number; readonly width:number; readonly height:number; readonly docnum:string; }
/** The preview scales only a clone; PDF capture always uses the renderer's unscaled A4 tree. */
export function LetterPreview({ preview }: { readonly preview:LetterPreviewData }) {
  const box=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(0);
  useEffect(()=>{const node=box.current;if(!node)return;const update=()=>setWidth(node.clientWidth);update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect()},[]);
  const scale=width?Math.min(1,width/preview.width):0;
  return <Card title="Document preview" description={`${preview.docnum} · ${preview.pageCount} ${preview.pageCount===1?'page':'pages'}`}>
    <div ref={box} className="letter-preview-viewport" style={{height:scale?Math.ceil(preview.height*scale):120}}>
      <div className="letter-preview-scaled" style={{width:preview.width,transform:`scale(${scale})`,visibility:scale?'visible':'hidden'}}>
        <div className="letter-document" dangerouslySetInnerHTML={{__html:preview.pagesHtml}} />
      </div>
    </div>
  </Card>;
}
