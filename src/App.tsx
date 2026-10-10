import { useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, FileText, FolderOpen, Globe2, Home, Languages, Layers, LayoutGrid, List, LockKeyhole, Plus, RotateCcw, Search, Settings2, ShieldCheck, X, Zap } from 'lucide-react';
import { defaultSettings, editObject, freshState, restoreState, STORAGE_KEY, preview } from './core';
import { prepareJob, runJob } from './jobs';
import { DemoProvider, GeminiProvider } from './providers';
import { LANGUAGES } from './types';
import type { Drawing, Language, PersistedState, ReportRow, Scope, Settings, TargetLanguage, TextObject, RowStatus } from './types';
import DrawingCanvas, { DrawingThumbnail } from './components/DrawingCanvas';
import type { DisplayMode } from './components/DrawingCanvas';
import Workflow from './components/Workflow';
import Report from './components/Report';
import GlossaryEditor from './components/GlossaryEditor';
import { Badge, Empty, LanguageSelect, Modal } from './components/UI';

function load() { try { return restoreState(localStorage.getItem(STORAGE_KEY)); } catch { return freshState(); } }
export default function App() {
  const [state, setState] = useState<PersistedState>(load);
  const stateRef = useRef(state);
  const [page, setPage] = useState<'home'|'drawing'|'reports'>('home');
  const [drawingId, setDrawingId] = useState(state.drawings[0].id);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<TargetLanguage>('fr');
  const [language, setLanguage] = useState<Language>('en');
  const [mode, setMode] = useState<DisplayMode>('target');
  const [provider, setProvider] = useState<Settings['provider']>(import.meta.env.VITE_GEMINI_API_KEY ? 'gemini':'demo');
  const [workflow, setWorkflow] = useState<{scope:Scope;batch:boolean}>();
  const [reportId, setReportId] = useState<string>(state.jobs[0]?.id ?? '');
  const [reportPanel, setReportPanel] = useState(false);
  const [focusedRow, setFocusedRow] = useState<ReportRow>();
  const [reportFilter, setReportFilter] = useState<RowStatus | 'All'>('All');
  const [located, setLocated] = useState<{drawingId:string;objectId:string;nonce:number}>();
  const [edit, setEdit] = useState<{object:TextObject;language:Language;value:string}>();
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [homeFilter, setHomeFilter] = useState<'all'|'source'|'copies'>('all');
  const [listView, setListView] = useState(false);
  const [notice, setNotice] = useState('');
  const commit = (next:PersistedState) => {
    stateRef.current = next; setState(next);
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(next)); } catch { setNotice('Browser storage is unavailable or full. Changes are kept for this session.'); }
  };
  const drawing = state.drawings.find(d=>d.id===drawingId) ?? state.drawings[0];
  const report = state.jobs.find(j=>j.id===reportId) ?? state.jobs[0];
  const activeJob = state.jobs.find(j=>j.status==='Running');
  const versions = state.drawings.reduce((n,d)=>n+(['fr','de','zh'] as const).filter(l=>d.objects.some(o=>o.translations[l]!==undefined)).length,0);
  const openDrawing = (d:Drawing) => {setDrawingId(d.id);setPage('drawing');setSelected([]);setReportPanel(false);setLanguage(d.copiedFrom?(['fr','de','zh'] as const).find(l=>d.objects.some(o=>o.translations[l]!==undefined))??'en':'en');setMode('target');};
  const openWorkflow = (selection?:string[]) => setWorkflow({scope:{drawingIds:[drawing.id],...(selection?{selection}: {})},batch:false});
  const locate = (row:ReportRow) => {
    setFocusedRow(row);
    setDrawingId(row.outputDrawingId);setPage('drawing');setLanguage(row.status==='Skipped'?'en':row.target);setMode('target');setSelected([row.objectId]);setReportPanel(true);
    setLocated({drawingId:row.outputDrawingId,objectId:row.objectId,nonce:Date.now()});
  };
  const start = async (scope:Scope, settings:Settings) => {
    if (stateRef.current.jobs.some(j=>j.status==='Running')) return;
    const prepared = prepareJob(stateRef.current,scope,settings);
    setWorkflow(undefined);setReportFilter('All');setFocusedRow(undefined);setProvider(settings.provider);setTarget(settings.target);setReportId(prepared.jobId);commit(prepared.state);
    const translator = settings.provider==='demo'?new DemoProvider():new GeminiProvider(import.meta.env.VITE_GEMINI_API_KEY??'',import.meta.env.VITE_GEMINI_MODEL||'gemini-3.5-flash-lite');
    try {
      await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,translator,commit);
      setPage('reports');setReportPanel(false);
    } catch {
      commit(restoreState(JSON.stringify(stateRef.current)));setNotice('The job was interrupted. Completed translations were preserved.');setPage('reports');
    }
  };
  const displayEdit = (object:TextObject) => {
    if(object.locked){setNotice('This object is on a locked layer. Its text cannot be edited.');return;}
    const editLang = mode==='source'?'en':language;
    setEdit({object,language:editLang,value:editLang==='en'?object.sourceText:object.translations[editLang]??object.sourceText});
  };
  const languageState = (l:TargetLanguage) => {
    const settings = { ...defaultSettings([drawing],provider), target:l, replaceExisting:true };
    const applicable = preview([drawing], {drawingIds:[drawing.id]}, settings, state.glossary).filter(d=>d.eligible);
    const count = applicable.filter(d=>d.object.translations[l]!==undefined).length;
    return { count, status:count===0?'Not translated':count<applicable.length?'Partial':'Complete' };
  };
  const drawings = state.drawings.filter(d=>d.name.toLowerCase().includes(query.toLowerCase())&&(homeFilter==='all'||(homeFilter==='copies'?!!d.copiedFrom:!d.copiedFrom)));
  return <div className="app-shell">
    <header className="app-header"><button className="brand" onClick={()=>{setPage('home');setReportPanel(false);}} aria-label="CAD Translate Home"><span className="brand-mark">A</span><span>CAD<span className="brand-light">Translate</span><small>TRANSLATION STUDIO</small></span></button>
      <nav className="top-tabs"><button className={page==='home'?'active':''} onClick={()=>setPage('home')}><Home size={15}/> Home</button>{page==='drawing'&&<button className="active"><FileText size={14}/>{drawing.name}<X size={13} onClick={e=>{e.stopPropagation();setPage('home');}}/></button>}{page==='reports'&&<button className="active"><List size={15}/> Reports</button>}</nav>
      <div className="header-actions"><span className="prototype-label">AUTODESK MT WORKFLOW · SIMULATION</span><label className="provider-select"><span className="live-dot"/><select aria-label="Translation provider" value={provider} disabled={!!activeJob} onChange={e=>setProvider(e.target.value as Settings['provider'])}><option value="demo">Offline demo</option><option value="gemini" disabled={!import.meta.env.VITE_GEMINI_API_KEY}>Gemini simulation</option></select><ChevronDown size={12}/></label><button className="icon-button" aria-label="Demo help" onClick={()=>setHelpOpen(true)}><CircleHelp size={18}/></button><span className="avatar">RC</span></div>
    </header>
    {notice&&<div className="notice" role="status">{notice}<button aria-label="Dismiss notice" className="icon-button" onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <div className="app-body">
      {page!=='drawing'&&<aside className="sidebar"><div className="project-switch"><span className="project-icon"><Layers size={19}/></span><div><strong>Riverside Campus</strong><small>Demonstration project</small></div></div><span className="nav-label">WORKSPACE</span><button className={'nav-item '+(page==='home'?'active':'')} onClick={()=>setPage('home')}><LayoutGrid size={17}/> Drawings <span>{state.drawings.length}</span></button><button className={'nav-item '+(page==='reports'?'active':'')} onClick={()=>setPage('reports')}><List size={17}/> Translation reports <span>{state.jobs.length}</span></button><button className="nav-item" onClick={()=>setGlossaryOpen(true)}><LockKeyhole size={17}/> Project glossary <span>{state.glossary.length}</span></button>
        <div className="sidebar-divider"/><span className="nav-label">LANGUAGES</span>{(['fr','de','zh'] as const).map(l=><div className="sidebar-language" key={l}><span className="language-symbol">{LANGUAGES[l].suffix}</span>{l==='zh'?'Chinese':LANGUAGES[l].name}<span>{state.drawings.filter(d=>d.objects.some(o=>o.translations[l]!==undefined)).length}</span></div>)}
        <div className="sidebar-bottom"><div className="local-state"><span className="live-dot"/> Saved in this browser</div><button className="text-button" onClick={()=>setResetOpen(true)}><RotateCcw size={13}/> Reset demo data</button><p>AutoCAD-inspired prototype<br/>Mock drawings · local workspace</p></div>
      </aside>}
      {page==='home'&&<main className="home-main"><div className="breadcrumb">WORKSPACE <ChevronRight size={12}/> RIVERSIDE CAMPUS</div>
        <div className="home-hero"><div><div className="eyebrow"><Globe2 size={15}/> BUILT FOR A CONNECTED PROJECT</div><h1>Your drawings.<br/><span>Every language.</span></h1><p>A clear path from source drawing to translated handoff.<br/>Preview, protect, and translate — one drawing or an entire set.</p></div><button className="primary large" onClick={()=>setWorkflow({scope:{drawingIds:[]},batch:true})}><Languages size={19}/> Translate Drawings <ArrowRight size={17}/></button><div className="hero-grid" aria-hidden="true"><Globe2 size={160}/></div></div>
        <div className="home-stats"><div><FileText size={19}/><span><strong>{state.drawings.length}</strong>Drawings</span></div><div><Layers size={19}/><span><strong>{state.drawings.reduce((n,d)=>n+d.objects.length,0)}</strong>Text objects</span></div><div><Languages size={19}/><span><strong>{versions}</strong>Language versions</span></div><div><ShieldCheck size={19}/><span><strong>100%</strong>Source preserved by translation</span></div></div>
        <div className="home-columns"><section className="drawings-section"><div className="section-heading"><div><h2>Project drawings <span className="count-pill">{state.drawings.length}</span></h2><p>Your source files and translated copies, together.</p></div><div className="view-switch"><button aria-label="Grid view" className={!listView?'active':''} onClick={()=>setListView(false)}><LayoutGrid size={16}/></button><button aria-label="List view" className={listView?'active':''} onClick={()=>setListView(true)}><List size={16}/></button></div></div>
          <div className="drawing-filters"><div className="segmented">{(['all','source','copies'] as const).map(f=><button className={homeFilter===f?'active':''} key={f} onClick={()=>setHomeFilter(f)}>{f==='all'?'All drawings':f==='source'?'Source files':'Translated copies'}</button>)}</div><label className="search-input"><Search size={14}/><input aria-label="Search drawings" placeholder="Search drawings…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
          <div className={'drawings-grid '+(listView?'list-view':'')}>{drawings.map((d,i)=><article className="drawing-card" key={d.id}><button className="thumbnail-button" onClick={()=>openDrawing(d)} aria-label={'Open '+d.name+' preview'}><DrawingThumbnail drawing={d}/><span className="discipline-chip">{d.discipline}</span><span className="drawing-index">{String(i+1).padStart(2,'0')}</span></button><div className="drawing-card-content"><div className="drawing-name"><FileText size={16}/><h3>{d.name}</h3>{d.copiedFrom&&<Badge value="Copy"/>}</div><p>{d.description}</p><div className="drawing-meta"><span>{d.objects.length} text objects</span><span className="language-chips">{(['fr','de','zh'] as const).filter(l=>d.objects.some(o=>o.translations[l]!==undefined)).map(l=><span key={l}>{LANGUAGES[l].suffix}</span>)}</span></div><div className="card-footer"><span><span className="source-dot"/>{d.copiedFrom?'Translated copy':'English source'}</span><button className="text-button" onClick={()=>openDrawing(d)}>Open drawing <ArrowRight size={14}/></button></div></div></article>)}</div>{!drawings.length&&<Empty>No drawings match this view.</Empty>}
        </section><aside className="home-aside"><div className="handoff-card"><span className="feature-icon"><ShieldCheck size={23}/></span><span className="eyebrow">CONFIDENCE AT EVERY STEP</span><h3>A safer translation<br/>handoff.</h3><p>Keep the original. Control what changes. Find every exception.</p><ol><li><span>01</span><div><strong>Preview your scope</strong><small>Know what is included, and why.</small></div></li><li><span>02</span><div><strong>Choose your output</strong><small>Add a language or create a copy.</small></div></li><li><span>03</span><div><strong>Review in context</strong><small>Locate results in the drawing.</small></div></li></ol><button className="text-button" onClick={()=>setHelpOpen(true)}>Explore the demo <ArrowRight size={14}/></button></div><div className="activity-card"><h4>Recent translations</h4>{state.jobs.slice(0,3).map(j=><button key={j.id} onClick={()=>{setReportId(j.id);setPage('reports');}}><span className="activity-icon"><Languages size={16}/></span><div><strong>{LANGUAGES[j.target].name} · {j.files.length} drawing{j.files.length>1?'s':''}</strong><small>{j.rows.filter(r=>r.status==='Translated'||r.status==='Warning').length} translations stored</small></div><ChevronRight size={14}/></button>)}{!state.jobs.length&&<p>Your translation jobs will appear here.<br/>Open a drawing to get started.</p>}</div></aside></div>
        <footer className="home-footer"><span>RIVERSIDE CAMPUS / TRANSLATION STUDIO</span><span><span className="live-dot"/> Local workspace ready</span></footer>
      </main>}
      {page==='drawing'&&<main className="workspace"><div className="drawing-ribbon"><div className="ribbon-title"><FolderOpen size={18}/><strong>{drawing.name}</strong><Badge value={drawing.discipline}/></div><div className="ribbon-controls"><LanguageSelect label="Target language" value={target} onChange={l=>setTarget(l as TargetLanguage)}/><div className="translation-buttons"><button className="secondary" disabled={!selected.length} onClick={()=>openWorkflow(selected)}><MouseSelectionIcon/> Translate Selection <span>{selected.length||''}</span></button><button className="primary" onClick={()=>openWorkflow()}><Languages size={16}/> Translate All</button></div><div className="ribbon-divider"/><button className={'secondary '+(reportPanel?'active':'')} disabled={!report} onClick={()=>setReportPanel(!reportPanel)}><List size={16}/> Report</button></div></div>
        <div className="workspace-content"><div className="canvas-column"><DrawingCanvas drawing={drawing} language={language} mode={mode} selected={selected} onSelect={id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])} onEdit={displayEdit} located={located}/><div className="drawing-status"><span><span className="canvas-dot"/> Model</span><span>{drawing.objects.length} text objects</span><span>{selected.length} selected{selected.length>0&&<button className="text-button" onClick={()=>setSelected([])}>Clear</button>}</span><span className="status-right"><LockKeyhole size={11}/> Original retained <span>1:100</span><Settings2 size={14}/></span></div></div>
          <aside className="language-panel"><div className="panel-heading"><Languages size={19}/><h3>Drawing languages</h3></div><p className="muted">One drawing. Multiple perspectives.</p><div className="language-list"><button className={language==='en'?'chosen':''} onClick={()=>setLanguage('en')}><span className="language-symbol">EN</span><div><strong>English</strong><small>Source language</small></div><ShieldCheck size={15}/></button>{(['fr','de','zh'] as const).map(l=>{const info=languageState(l);return <button key={l} className={language===l?'chosen':''} onClick={()=>setLanguage(l)}><span className="language-symbol">{LANGUAGES[l].suffix}</span><div><strong>{l==='zh'?'Chinese':LANGUAGES[l].name}</strong><small>{info.status}{info.count?' · '+info.count+' objects':''}</small></div>{info.count?<Check size={15}/>:<span className="empty-language-dot"/>}</button>;})}</div>
            <LanguageSelect label="Display language" value={language} source onChange={setLanguage}/><label className="field-label">Display mode<select aria-label="Display mode" value={mode} onChange={e=>setMode(e.target.value as DisplayMode)}><option value="target">Target language only</option><option value="source">Source language only</option><option value="bilingual">Bilingual</option></select></label><button className="secondary full" onClick={()=>openWorkflow()}><Plus size={15}/> Add Language</button>
            <div className="language-tip"><ShieldCheck size={17}/><p>The source is always available.<br/>An amber dot marks text with no translation in the selected language.</p></div><div className="canvas-legend"><span><i className="legend-selected"/> Selected object</span><span><i className="legend-warning"/> Possible text overflow</span><span><i className="legend-locked"/> Locked layer</span></div>
          </aside></div>
        {reportPanel&&report&&<Report key={report.id} job={report} filter={reportFilter} setFilter={setReportFilter} located={focusedRow} compact onLocate={locate} onClose={()=>setReportPanel(false)}/>}
      </main>}
      {page==='reports'&&<main className="reports-main"><div className="breadcrumb">WORKSPACE <ChevronRight size={12}/> TRANSLATION REPORTS</div><div className="section-heading"><div><h1>Translation reports</h1><p>Review exceptions. Find the object. Resolve it in the drawing.</p></div>{state.jobs.length>0&&<label className="field-label">Translation job<select aria-label="Translation job" value={report?.id??''} onChange={e=>setReportId(e.target.value)}>{state.jobs.map((j,i)=><option key={j.id} value={j.id}>{i===0?'Latest · ':''}{LANGUAGES[j.target].name} · {j.files.length} drawing{j.files.length>1?'s':''} · {new Date(j.startedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</option>)}</select></label>}</div>{report?<Report key={report.id} job={report} filter={reportFilter} setFilter={setReportFilter} located={focusedRow} onLocate={locate}/>:<div className="reports-empty"><Languages size={45}/><h2>Your next handoff starts here.</h2><p>Translate a drawing to see a detailed report with results, exceptions, and direct navigation.</p><button className="primary" onClick={()=>setPage('home')}>Browse drawings <ArrowRight size={16}/></button></div>}</main>}
    </div>
    {workflow&&<Workflow state={state} initialScope={workflow.scope} batch={workflow.batch} target={target} provider={provider} onState={commit} onClose={()=>setWorkflow(undefined)} onRun={start}/>}
    {activeJob&&<Modal title="Translating your drawings" subtitle={'English → '+LANGUAGES[activeJob.target].name+' · '+(activeJob.provider==='demo'?'Offline demonstration':'Gemini simulation')}>
      <div className="progress-body"><div className="progress-symbol"><Languages size={32}/></div><h3>{activeJob.processed} / {activeJob.total} objects processed</h3><p className="muted">{activeJob.files.filter(f=>['Complete','Warning','Failed'].includes(f.status)).length} of {activeJob.files.length} drawings complete</p><div className="progress-track" role="progressbar" aria-label="Translation progress" aria-valuenow={activeJob.processed} aria-valuemin={0} aria-valuemax={activeJob.total}><div style={{width:(activeJob.total?activeJob.processed/activeJob.total*100:100)+'%'}}/></div><strong className="progress-percent">{Math.round(activeJob.processed/Math.max(1,activeJob.total)*100)}%</strong>
        <div className="progress-files">{activeJob.files.map(f=><div key={f.sourceId}><FileText size={19}/><div><strong>{f.name}</strong><small>{f.processed} / {f.total} objects</small></div><Badge value={f.status==='Running'?Math.round(f.processed/Math.max(1,f.total)*100)+'%':f.status}/></div>)}</div><div className="safe-note"><ShieldCheck size={17}/><p>Completed translations are saved as the job runs. Original source text remains available.</p></div></div>
    </Modal>}
    {edit&&<Modal title="Edit drawing text" subtitle={drawing.name+' · '+edit.object.type+' · '+edit.object.layer} onClose={()=>setEdit(undefined)}><div className="edit-body"><LanguageSelect label="Editing language" source value={edit.language} onChange={l=>setEdit({...edit,language:l,value:l==='en'?edit.object.sourceText:edit.object.translations[l]??edit.object.sourceText})}/><label className="field-label">Text<textarea aria-label="Drawing text" rows={4} value={edit.value} onChange={e=>setEdit({...edit,value:e.target.value})} maxLength={2000}/></label><p className="muted">{edit.language==='en'?'Changing the source clears this object’s existing translations.':'This edits only the selected language version.'}</p></div><div className="modal-footer"><button className="secondary" onClick={()=>setEdit(undefined)}>Cancel</button><button className="primary" disabled={!edit.value.trim()} onClick={()=>{commit({...stateRef.current,drawings:editObject(stateRef.current.drawings,drawing.id,edit.object.id,edit.language,edit.value.trim())});setEdit(undefined);}}>Save text <Check size={15}/></button></div></Modal>}
    {glossaryOpen&&<Modal title="Project glossary" subtitle="Reusable terminology for all drawings in this browser." onClose={()=>setGlossaryOpen(false)}><div className="edit-body"><LanguageSelect label="Preferred translation language" value={target} onChange={l=>setTarget(l as TargetLanguage)}/><GlossaryEditor entries={state.glossary} language={target} onChange={glossary=>commit({...stateRef.current,glossary})}/></div><div className="modal-footer"><span className="muted">Changes save automatically.</span><button className="primary" onClick={()=>setGlossaryOpen(false)}>Done <Check size={15}/></button></div></Modal>}
    {resetOpen&&<Modal title="Reset demo data?" subtitle="This clears local drawing edits, copies, translations, presets, glossary changes, and reports." onClose={()=>setResetOpen(false)}><div className="modal-footer"><button className="secondary" onClick={()=>setResetOpen(false)}>Keep my work</button><button className="primary" onClick={()=>{const next=freshState();commit(next);setDrawingId(next.drawings[0].id);setPage('home');setReportId('');setSelected([]);setResetOpen(false);}}>Reset demo data <RotateCcw size={15}/></button></div></Modal>}
    {helpOpen&&<Modal title="A clearer translation workflow" subtitle="AutoCAD-inspired UX prototype. Gemini simulates Autodesk MT; offline mode uses prepared fixtures." onClose={()=>setHelpOpen(false)}><div className="help-body"><div><span>01</span><p><strong>Single drawing</strong>Open Level_01.dwg. Translate All to French, review the preview, and add the language to the same file.</p></div><div><span>02</span><p><strong>A precise selection</strong>Open Mechanical_Plan.dwg, click three annotations, and choose Translate Selection.</p></div><div><span>03</span><p><strong>A separate handoff</strong>Translate Site_Plan.dwg and choose Create translated copy. Both files appear on Home.</p></div><div><span>04</span><p><strong>An entire set</strong>Use Translate Drawings on Home, select files, and load a reusable preset.</p></div><div><span>05</span><p><strong>Protected terminology</strong>Translate INSTALL AHU-01 ABOVE CEILING. AHU-01 retains its exact spelling.</p></div><div className="safe-note"><CheckCircle2 size={19}/><p>Use report filters to find warnings. Locate an object, switch languages, or double-click to edit it.</p></div></div></Modal>}
  </div>;
}
function MouseSelectionIcon(){return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" strokeWidth="1.4"/><path d="m6 5 5 4-2 1-1 2z" fill="currentColor"/></svg>;}
