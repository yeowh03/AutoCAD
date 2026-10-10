import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Crosshair, Download, FileText, Search, X } from 'lucide-react';
import { instances } from '../core';
import { LANGUAGES } from '../types';
import type { Job, ReportRow, RowStatus } from '../types';
import { Badge, Empty } from './UI';

const statuses: RowStatus[] = ['Translated', 'Skipped', 'Unchanged', 'Failed', 'Warning'];
export default function Report({ job, compact = false, onLocate, onClose, located, filter, setFilter }: { filter: RowStatus | 'All'; setFilter: (value: RowStatus | 'All') => void; located?: ReportRow; job: Job; compact?: boolean; onLocate: (row: ReportRow) => void; onClose?: () => void }) {
  const [drawing, setDrawing] = useState('all');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ReportRow | undefined>(located);
  const grouped = active ? instances(job.rows, active.original) : [];
  const index = active ? grouped.findIndex(r => r.id === active.id) : -1;
  const locate = (row: ReportRow) => { setActive(row); onLocate(row); };
  const rows = job.rows.filter(r => (filter === 'All' || r.status === filter) && (drawing === 'all' || r.outputDrawingId === drawing) && (r.original + ' ' + r.translation + ' ' + r.reason).toLowerCase().includes(search.toLowerCase()));
  const exportReport = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(job,null,2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'Translation_Report_'+LANGUAGES[job.target].suffix+'.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <section className={'report '+(compact?'report-compact':'')} aria-label="Translation report">
    <div className="report-heading"><div><div className="eyebrow"><FileText size={13}/> TRANSLATION REPORT</div><h2>{compact?'Review results':job.status==='Interrupted'?'Translation interrupted':'Translation complete'} {!compact&&<CheckCircle2 size={23}/>}</h2><p>{job.files.length} drawing{job.files.length>1?'s':''} processed · English → {LANGUAGES[job.target].name} · {job.provider==='demo'?'Offline demo':'Gemini simulation'}</p></div><div className="button-group"><button className="secondary small" onClick={exportReport}><Download size={14}/> Export report</button>{onClose&&<button className="icon-button" aria-label="Close report" onClick={onClose}><X size={18}/></button>}</div></div>
    {!compact&&<><div className="report-stats">{statuses.map(s=><button key={s} onClick={()=>setFilter(s)} className={'stat-status stat-'+s.toLowerCase()}><span>{s==='Warning'?'Warnings':s}</span><strong>{job.rows.filter(r=>r.status===s).length}</strong></button>)}</div>
      <div className="job-totals"><strong>{job.files.filter(f=>f.status==='Complete').length} complete</strong><span>{job.files.filter(f=>f.status==='Warning').length} with warnings</span><span>{job.files.filter(f=>f.status==='Failed').length} failed</span></div><div className="batch-summary">{job.files.map(f=><div key={f.sourceId}><FileText size={15}/><span>{f.name}</span><Badge value={f.status==='Warning'?'With warnings':f.status}/></div>)}</div></>}
    <div className="report-toolbar"><div className="report-tabs">{(['All',...statuses] as const).map(s=><button key={s} className={filter===s?'active':''} onClick={()=>setFilter(s)}>{s==='Warning'?'Warnings':s}<span>{s==='All'?job.rows.length:job.rows.filter(r=>r.status===s).length}</span></button>)}</div><div className="report-search"><select aria-label="Filter report by drawing" value={drawing} onChange={e=>setDrawing(e.target.value)}><option value="all">All drawings</option>{job.files.map(f=><option key={f.outputId} value={f.outputId}>{f.name}</option>)}</select><label className="search-input"><Search size={14}/><input aria-label="Search report" placeholder="Find text or reason…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div></div>
    <div className="report-table" tabIndex={0}><table><thead><tr><th>Drawing</th><th>Object type</th><th>Layer</th><th>Original</th><th>Translation</th><th>Status</th><th>Reason</th><th>Action</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} className={active?.id===row.id?'active-row':''}>
      <td><span className="file-cell">{row.drawingName}</span><small>{row.objectId}</small></td><td>{row.type}</td><td><code>{row.layer}</code></td><td>{row.original}{instances(job.rows,row.original).length>1&&<button className="instance-link" onClick={()=>locate(row)}>{instances(job.rows,row.original).length} instances</button>}</td><td className={!row.translation?'muted':'translation-cell'}>{row.translation||'—'}</td><td><Badge value={row.status}/></td><td className="reason-cell">{row.reason}</td><td><button className="locate-button" aria-label={'Locate '+row.original+' in '+row.drawingName} onClick={()=>locate(row)}><Crosshair size={14}/> Locate</button></td>
    </tr>)}</tbody></table>{!rows.length&&<Empty>No objects match these filters.</Empty>}</div>
    {active&&<div className="instance-bar"><Crosshair size={15}/><div><strong>{active.original}</strong><span>{grouped.length} instance{grouped.length===1?'':'s'} across {new Set(grouped.map(r=>r.outputDrawingId)).size} drawing{new Set(grouped.map(r=>r.outputDrawingId)).size===1?'':'s'}</span></div><button className="secondary small" disabled={index<=0} onClick={()=>locate(grouped[index-1])}><ArrowLeft size={13}/> Previous</button><span>{index+1} of {grouped.length}</span><button className="secondary small" disabled={index>=grouped.length-1} onClick={()=>locate(grouped[index+1])}>Next <ArrowRight size={13}/></button></div>}
    <div className="report-foot"><span>{rows.length} of {job.rows.length} objects</span><span>Locate an object to edit it in the drawing.</span></div>
  </section>;
}
