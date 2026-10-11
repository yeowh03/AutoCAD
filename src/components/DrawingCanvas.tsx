import { useEffect, useRef, useState } from 'react';
import { Crosshair, Maximize, Minus, Plus, Hand, MousePointer2, LockKeyhole } from 'lucide-react';
import { measureOverflow, reportReason } from '../core';
import type { Drawing, TextObject } from '../types';

export function Geometry({ drawing }: { drawing: Drawing }) {
  if (drawing.demo === 'locate') return <g className="geometry demo-geometry">
    {[{x:180,y:110,w:290,h:160},{x:495,y:110,w:290,h:160},{x:810,y:110,w:290,h:160},{x:180,y:310,w:360,h:185},{x:585,y:310,w:400,h:185}].map((room,i)=><g key={i}><rect x={room.x} y={room.y} width={room.w} height={room.h}/><rect x={room.x+7} y={room.y+7} width={room.w-14} height={room.h-14}/><text x={room.x+16} y={room.y+23}>SERVICE CORE {String(i+1).padStart(2,'0')}</text></g>)}
    <path d="M180 535H1100M180 545H1100"/><text x="180" y="585">LOCATE DEMO / FIVE IDENTICAL SOURCE LABELS</text>
  </g>;
  if (drawing.discipline === 'Site') return <g className="geometry site-geometry">
    <path d="M160 110 950 90 1060 580 850 600 820 710 150 650Z" strokeDasharray="10 7" />
    <path d="M120 540H1080M120 570H1080" /><path d="M380 90V600M420 90V600" />
    <rect x="475" y="120" width="410" height="350" /><rect x="490" y="135" width="380" height="320" />
    <path d="M490 260H870M670 135V455M490 380H870" />
    {[210,285,970,1020].map((x,i) => <g key={x}><circle cx={x} cy={200+i*50} r="25" /><circle cx={x} cy={200+i*50} r="17" /></g>)}
    <path d="M200 80V40M190 53 200 40 210 53" /><text x="196" y="30">N</text>
  </g>;
  return <g className="geometry">
    <rect x="170" y="110" width="950" height="500" /><rect x="181" y="121" width="928" height="478" />
    <path d="M470 121V440M478 121V440M770 121V440M778 121V440M181 275H1109M181 283H1109M181 445H1109M181 453H1109" />
    <path d="M470 470V599M478 470V599M770 470V599M778 470V599" />
    {[225,530,835].map(x => <g key={x}><path d={'M'+x+' 445v-45a45 45 0 0 1 45 45'} strokeWidth="1"/><path d={'M'+(x+185)+' 283v-40a40 40 0 0 0-40 40'} strokeWidth="1"/></g>)}
    <path d="M170 82H1120M170 70V94M470 70V94M770 70V94M1120 70V94M134 110V610M122 110H146M122 275H146M122 445H146M122 610H146" className="dimension-line" />
    {['1','2','3','4'].map((n,i) => <g key={n}><circle cx={170+i*316} cy="48" r="12" /><text x={170+i*316} y="52" textAnchor="middle">{n}</text></g>)}
    {drawing.discipline === 'Mechanical' && <g className="ducts"><path d="M245 235H1000V520H300M640 235V360H900M340 235V360" strokeWidth="9" /><path d="M245 235H1000V520H300M640 235V360H900M340 235V360" strokeWidth="1" strokeDasharray="4 5" /></g>}
    <path d="M920 690h200v45H920zM970 690v45M920 713h200" strokeWidth="1" />
    <text x="926" y="706">RIVERSIDE CAMPUS</text><text x="976" y="728">{drawing.discipline.toUpperCase()}</text>
  </g>;
}

export function DrawingThumbnail({ drawing }: { drawing: Drawing }) {
  return <svg viewBox="95 20 1100 745" className="drawing-thumbnail" aria-hidden="true"><Geometry drawing={drawing}/>{drawing.objects.filter(o => o.type !== 'Unsupported').map(o => <text key={o.id} x={o.x} y={o.y} fontSize="11" fill="#7ec4c6" opacity=".72">{o.text}</text>)}</svg>;
}

export default function DrawingCanvas({ drawing, selected, onSelect, onEdit, located }: {
  drawing: Drawing; selected: string[];
  onSelect: (id: string) => void; onEdit: (object: TextObject) => void;
  located?: { drawingId: string; objectId: string; nonce: number };
}) {
  const [view, setView] = useState({ x: 80, y: 0, width: 1120, height: 790 });
  const [highlight, setHighlight] = useState<string>();
  const [panMode, setPanMode] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | undefined>(undefined);
  useEffect(() => { setView({ x: 80, y: 0, width: 1120, height: 790 }); setHighlight(undefined); }, [drawing.id]);
  useEffect(() => {
    if (!located || located.drawingId !== drawing.id) return;
    const object = drawing.objects.find(o => o.id === located.objectId);
    if (!object) return;
    setView({ x: object.x + object.width / 2 - 335, y: object.y - 16 + (object.height + 6) / 2 - 237.5, width: 670, height: 475 });
    setHighlight(object.id);
    const timer = setTimeout(() => setHighlight(undefined), 4500);
    return () => clearTimeout(timer);
  }, [located?.nonce, drawing.id]);
  const zoom = (factor: number) => setView(v => {
    const width = Math.max(320, Math.min(2000, v.width * factor));
    const height = width * 790 / 1120;
    return { x: v.x + (v.width - width) / 2, y: v.y + (v.height - height) / 2, width, height };
  });
  return <div className="canvas-wrapper">
    <div className="canvas-info"><span className="canvas-dot"/> MODEL SPACE <span>TOP / 2D WIREFRAME</span></div>
    <svg ref={svgRef} className={'drawing-canvas ' + (panMode ? 'pan-mode' : '')} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label={'Drawing canvas ' + drawing.name}
      onWheel={e => { zoom(e.deltaY > 0 ? 1.12 : .88); }}
      onPointerDown={e => { if (e.target === e.currentTarget || panMode || e.button === 1) { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, originX: view.x, originY: view.y, moved: false }; } }}
      onPointerMove={e => { const start = drag.current; if (!start) return; const rect = e.currentTarget.getBoundingClientRect(); const scale = Math.max(view.width / rect.width, view.height / rect.height); start.moved = true; setView(v => ({ ...v, x: start.originX - (e.clientX - start.x) * scale, y: start.originY - (e.clientY - start.y) * scale })); }}
      onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}>
      <defs><pattern id="drawing-grid" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".65" fill="#394754" /></pattern></defs>
      <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#drawing-grid)" pointerEvents="none" />
      <g pointerEvents="none"><Geometry drawing={drawing}/></g>
      {drawing.objects.map(object => {
        const text = object.text;
        const missing = object.language !== drawing.language;
        const active = selected.includes(object.id);
        const overflow = object.lastStatus === 'Warning' || (object.language !== 'en' && measureOverflow(object, text));
        return <g key={object.id} role="button" tabIndex={0} aria-label={object.text + ' (' + object.id + ')'} aria-pressed={active}
          data-object-id={object.id} data-display-text={text} data-retained={missing} data-language={object.language} data-status={object.lastStatus ?? ''}
          className={['text-object', active ? 'selected' : '', highlight === object.id ? 'located' : '', overflow ? 'overflow' : '', object.locked ? 'locked-object' : ''].join(' ')}
          transform={`translate(${object.x}, ${object.y})`}
          onClick={e => { e.stopPropagation(); if (!panMode) onSelect(object.id); }}
          onDoubleClick={e => { e.stopPropagation(); if (!panMode) onEdit(object); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(object.id); } if (e.key === 'F2') onEdit(object); }}>
          <title>{object.type} · {object.layer}{object.locked ? ' · Locked' : ''}{missing ? ' · Retained input text' : ''}{object.lastStatus ? ' · ' + object.lastStatus : ''}{object.lastReason ? ' · ' + reportReason(object.lastStatus, object.lastReason) : ''}</title>
          {object.type === 'MultiLeader' && <path d="M-22 28 -12 6 -3 6" className="leader" />}
          <rect className="text-bounds" x="-5" y="-16" width={object.width+10} height={object.height+6} rx="2" />
          <text y="0" fontFamily="Arial" fontSize={object.fontSize ?? 11} fill={active ? '#fff' : object.type === 'Dimension' ? '#acb68e' : object.type === 'Unsupported' ? '#9b80b3' : '#b6d5d2'}>
            {text.split('\n').map((line,index) => <tspan key={index} x="0" dy={index ? (object.fontSize ?? 11)*1.4 : 0}>{line}</tspan>)}
          </text>
          {missing && <circle cx="-10" cy="-4" r="2.5" fill="#d4a55d" />}
          {object.locked && <g transform={`translate(${object.width - 7},-13)`}><LockKeyhole size="9" color="#82919e"/></g>}
          {(active || highlight === object.id) && <><rect x="-6" y="-17" width="4" height="4" fill="#6ed4de"/><rect x={object.width+2} y="-17" width="4" height="4" fill="#6ed4de"/></>}
        </g>;
      })}
    </svg>
    <div className="canvas-compass"><span>Y</span><div><i/> X</div></div>
    <div className="canvas-hint"><MousePointer2 size={13}/> Click to select · Double-click to edit · Drag background to pan</div>
    <div className="canvas-controls"><button title="Selection tool" aria-label="Selection tool" className={!panMode?'active':''} onClick={() => setPanMode(false)}><MousePointer2 size={17}/></button><button title="Pan tool" aria-label="Pan tool" className={panMode?'active':''} onClick={() => setPanMode(true)}><Hand size={17}/></button><span/><button aria-label="Zoom out" onClick={() => zoom(1.2)}><Minus size={17}/></button><output>{Math.round(1120/view.width*100)}%</output><button aria-label="Zoom in" onClick={() => zoom(.8)}><Plus size={17}/></button><button aria-label="Fit drawing" onClick={() => setView({ x:80,y:0,width:1120,height:790 })}><Maximize size={17}/></button></div>
    <div className="canvas-view"><Crosshair size={13}/> WCS</div>
  </div>;
}
