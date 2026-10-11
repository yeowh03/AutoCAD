import { ArrowLeft, ArrowRight, Crosshair, List } from 'lucide-react';
import { instances, reportInstanceKey, reportReason } from '../core';
import { LANGUAGES } from '../types';
import type { Job, ReportRow } from '../types';
import { Badge } from './UI';

export default function InstanceNavigator({ job, active, onLocate, onReport }: {
  job: Job; active: ReportRow; onLocate: (row: ReportRow) => void; onReport: () => void;
}) {
  const matches = instances(job.rows, active.original, active.status);
  const index = matches.findIndex(row => reportInstanceKey(row) === reportInstanceKey(active));
  const retained = active.status === 'Failed' || active.status === 'Skipped';
  const text = active.translation || active.original;
  const reason = reportReason(active.status, active.reason);
  return <section className="locate-navigator instance-bar" aria-label="Located translation instance"
    data-active-object-id={active.objectId} data-active-status={active.status} data-active-target={active.target}
    data-active-instance-key={reportInstanceKey(active)} data-active-job-id={job.id} data-active-output-drawing-id={active.outputDrawingId}>
    <div className="navigator-content">
      <div className="navigator-meta"><Crosshair size={14}/><code>{active.objectId}</code><span>{active.drawingName}</span><Badge value={active.status}/>
        <span>{matches.length} {active.status.toLowerCase()} instance{matches.length===1?'':'s'} across {new Set(matches.map(row=>row.outputDrawingId)).size} drawing{new Set(matches.map(row=>row.outputDrawingId)).size===1?'':'s'}</span>
      </div>
      <div className="navigator-text"><span>{retained?'Retained text':'Translated text'} · {LANGUAGES[retained?active.sourceLanguage:active.target].name}</span><strong title={text}>{text}</strong></div>
      <p className="navigator-reason" title={reason}>{reason}</p>
      <span className="navigator-source" title={active.original}>Before: {active.original}</span>
    </div>
    <div className="navigator-actions">
      <div className="instance-navigation"><button className="secondary small" disabled={index<=0} onClick={()=>onLocate(matches[index-1])}><ArrowLeft size={13}/> Previous</button>
        <span>{index+1} of {matches.length}</span><button className="secondary small" disabled={index<0||index>=matches.length-1} onClick={()=>onLocate(matches[index+1])}>Next <ArrowRight size={13}/></button>
      </div>
      <button className="secondary small back-to-report" onClick={onReport}><List size={14}/> Back to report</button>
    </div>
  </section>;
}
