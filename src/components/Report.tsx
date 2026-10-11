import { useLayoutEffect, useRef } from 'react';
import { CheckCircle2, Crosshair, Download, FileText, Search } from 'lucide-react';
import { instances, jobSourceLabel, jobTargetLabel, jobTargets, reportInstanceKey, reportReason } from '../core';
import { LANGUAGES } from '../types';
import type { Job, ReportRow, ReportView, RowStatus } from '../types';
import { Badge, Empty } from './UI';

const statuses: RowStatus[] = ['Translated', 'Skipped', 'Failed', 'Warning'];
export default function Report({ job, onLocate, activeInstanceKey, view, onViewChange }: {
  view: ReportView; onViewChange: (patch: Partial<ReportView>) => void; activeInstanceKey?: string;
  job: Job; onLocate: (row: ReportRow) => void;
}) {
  const table = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (table.current) { table.current.scrollTop = view.scrollTop; table.current.scrollLeft = view.scrollLeft; }
  }, [view.status, view.drawing, view.search]);
  useLayoutEffect(() => {
    if(activeInstanceKey)table.current?.focus({preventScroll:true});
    window.scrollTo(0, view.pageScrollTop);
  }, []);
  const locateRow = (row:ReportRow) => {
    onViewChange({scrollTop:table.current?.scrollTop ?? view.scrollTop,scrollLeft:table.current?.scrollLeft ?? view.scrollLeft,pageScrollTop:window.scrollY});
    onLocate(row);
  };
  // Filter individual records, so a matching source label cannot inherit another object's outcome.
  const matchesFilters = (r:ReportRow) => (view.status === 'All' || r.status === view.status) && (view.drawing === 'all' || r.outputDrawingId === view.drawing)
    && (r.objectId + ' ' + r.original + ' ' + r.translation + ' ' + reportReason(r.status,r.reason)).toLowerCase().includes(view.search.toLowerCase());
  const rows = job.rows.filter(matchesFilters);
  const exportReport = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({...job,rows:job.rows.map(row=>({...row,reason:reportReason(row.status,row.reason)}))},null,2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'Translation_Report_'+jobTargets(job).map(target=>LANGUAGES[target].suffix).join('_')+'.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="report" aria-label="Translation report" data-report-job-id={job.id}>
    <div className="report-heading"><div><div className="eyebrow"><FileText size={13}/> TRANSLATION REPORT</div><h2>{job.status==='Interrupted'?'Translation interrupted':'Translation complete'} <CheckCircle2 size={23}/></h2><p>{job.files.length} drawing{job.files.length>1?'s':''} processed · {jobSourceLabel(job)} → {jobTargetLabel(job)} · {job.provider==='demo'?'Offline demo':'Gemini simulation'}</p></div><div className="button-group"><button className="secondary small" onClick={exportReport}><Download size={14}/> Export report</button></div></div>
    <div className="report-stats">{statuses.map(s=><button key={s} onClick={()=>onViewChange({status:s,scrollTop:0})} className={'stat-status stat-'+s.toLowerCase()}><span>{s==='Warning'?'Warnings':s}</span><strong>{job.rows.filter(r=>r.status===s).length}</strong></button>)}</div>
    <div className="job-totals"><strong>{job.files.filter(f=>f.status==='Complete').length} complete</strong><span>{job.files.filter(f=>f.status==='Warning').length} with warnings</span><span>{job.files.filter(f=>f.status==='Failed').length} failed</span></div>
    <div className="batch-summary">{job.files.map(f=><div key={f.outputId}><FileText size={15}/><span>{f.name}</span><Badge value={f.status==='Warning'?'With warnings':f.status}/></div>)}</div>
    <div className="report-toolbar"><div className="report-tabs">{(['All',...statuses] as const).map(s=><button key={s} className={view.status===s?'active':''} onClick={()=>onViewChange({status:s,scrollTop:0})}>{s==='Warning'?'Warnings':s}<span>{s==='All'?job.rows.length:job.rows.filter(r=>r.status===s).length}</span></button>)}</div><div className="report-search"><select aria-label="Filter report by drawing" value={view.drawing} onChange={e=>onViewChange({drawing:e.target.value,scrollTop:0})}><option value="all">All drawings</option>{job.files.map(f=><option key={f.outputId} value={f.outputId}>{f.name}</option>)}</select><label className="search-input"><Search size={14}/><input aria-label="Search report" placeholder="Find text, object ID or reason…" value={view.search} onChange={e=>onViewChange({search:e.target.value,scrollTop:0})}/></label></div></div>
    <p className="report-instance-note">Each row is one object instance. {view.status==='All'?'Identical text can have different statuses and reasons.':'Showing only '+view.status.toLowerCase()+' instances; other statuses are hidden.'}</p>
    <div className="report-table" tabIndex={0} ref={table} onScroll={event=>{
      const {scrollTop,scrollLeft}=event.currentTarget;
      if(scrollTop!==view.scrollTop||scrollLeft!==view.scrollLeft)onViewChange({scrollTop,scrollLeft});
    }}>
      <table><thead><tr>{['Drawing','Instance','Object type','Layer','Before','After','Status','Reason','Action'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row=>{
          const key=reportInstanceKey(row);
          const matching=instances(job.rows,row.original,row.status);
          const position=matching.findIndex(item=>reportInstanceKey(item)===key)+1;
          return <tr key={key} data-report-row-id={row.id} data-report-instance-key={key}
            data-report-source-drawing-id={row.sourceDrawingId} data-report-output-drawing-id={row.outputDrawingId}
            data-report-object-id={row.objectId} data-report-status={row.status} data-report-target={row.target}
            className={activeInstanceKey===key?'active-row':''}>
            <td className="report-drawing"><span className="file-cell">{row.drawingName}</span><small>{LANGUAGES[row.target].name}</small></td>
            <td className="report-instance-cell"><code className="report-object-id">{row.objectId}</code>
              {matching.length>1?<button className="instance-link" aria-label={'Navigate '+row.status.toLowerCase()+' instances for '+row.objectId+' in '+row.drawingName} onClick={()=>locateRow(row)}>{position} of {matching.length} {row.status.toLowerCase()} instances</button>:<small>1 {row.status.toLowerCase()} instance</small>}
            </td>
            <td className="report-type">{row.type}</td><td className="report-layer"><code>{row.layer}</code></td>
            <td className="report-before">{row.original}</td><td className={!row.translation?'muted':'translation-cell'}>{row.translation||'—'}</td>
            <td className="report-status"><Badge value={row.status}/></td><td className="reason-cell">{reportReason(row.status,row.reason)}</td>
            <td className="report-action"><button className="locate-button" aria-label={'Locate '+row.objectId+' in '+row.drawingName} onClick={()=>locateRow(row)}><Crosshair size={14}/> Locate</button></td>
          </tr>;
        })}</tbody>
      </table>{!rows.length&&<Empty>No objects match these filters.</Empty>}
    </div>
    <div className="report-foot"><span>{rows.length} of {job.rows.length} object instances</span><span>Locate opens the exact instance shown in its row.</span></div>
  </section>;
}
