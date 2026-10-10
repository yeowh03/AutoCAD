import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Copy, FileText, Layers, ListFilter, LockKeyhole, Plus, Save, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { defaultSettings, preview, savePreset, splitGlossaryText, validatePatterns } from '../core';
import { LANGUAGES, OBJECT_TYPES } from '../types';
import type { PersistedState, Scope, Settings, TargetLanguage } from '../types';
import { Badge, LanguageSelect, Modal } from './UI';
import GlossaryEditor from './GlossaryEditor';

export default function Workflow({ state, initialScope, batch, target, provider, onState, onClose, onRun }: {
  state: PersistedState; initialScope: Scope; batch: boolean; target: TargetLanguage; provider: Settings['provider'];
  onState: (state: PersistedState) => void; onClose: () => void; onRun: (scope: Scope, settings: Settings) => void;
}) {
  const [scope, setScope] = useState(initialScope);
  const [step, setStep] = useState<'scope' | 'settings' | 'preview'>(batch ? 'scope' : 'settings');
  const [settings, setSettings] = useState<Settings>({ ...defaultSettings(state.drawings, provider), target });
  const [preset, setPreset] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [pattern, setPattern] = useState('');
  const [patternError, setPatternError] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const [showIncluded, setShowIncluded] = useState(false);
  const invalid = validatePatterns(settings.patterns);
  const decisions = useMemo(() => invalid ? [] : preview(state.drawings, scope, settings, state.glossary), [state.drawings, scope, settings, state.glossary, invalid]);
  const included = decisions.filter(d => d.eligible);
  const sentToMT = included.filter(d => splitGlossaryText(d.object.sourceText, state.glossary, settings.target).some(s => s.kind === 'translate')).length;
  const excluded = decisions.filter(d => !d.eligible && d.status !== 'Failed');
  const blocked = decisions.filter(d => d.status === 'Failed');
  const layers = [...new Set(state.drawings.filter(d => scope.drawingIds.includes(d.id)).flatMap(d => d.objects.map(o => o.layer)))].sort();
  const update = (patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch }));
  const toggle = <T,>(values: T[], value: T) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];
  const language = LANGUAGES[settings.target];
  const save = () => {
    if (!presetName.trim()) return;
    const next = savePreset(presetName.trim(), settings);
    onState({ ...state, presets: [...state.presets, next] }); setPreset(next.id); setSaveOpen(false); setPresetName('');
  };
  const steps = batch ? ['Drawings', 'Settings', 'Preview & output'] : ['Settings', 'Preview & output'];
  const activeIndex = step === 'scope' ? 0 : step === 'settings' ? (batch?1:0) : steps.length-1;
  return <Modal title={batch ? 'Translate drawings' : 'Translate ' + state.drawings.find(d => d.id === scope.drawingIds[0])?.name} subtitle="Review the scope. Protect the source. Translate with confidence." onClose={onClose} wide>
    <div className="workflow-steps">{steps.map((s,i) => <div key={s} className={i===activeIndex?'current':i<activeIndex?'done':''}><span>{i<activeIndex?<Check size={13}/>:i+1}</span>{s}{i<steps.length-1&&<ChevronRight size={14}/>}</div>)}</div>
    <div className="workflow-body">
      {step === 'scope' && <><div className="section-heading"><div><h3>Choose your drawings</h3><p>Translate multiple files without opening them individually.</p></div><Badge value={scope.drawingIds.length+' selected'}/></div>
        <div className="batch-list">{state.drawings.map(d => <label className={'batch-file '+(scope.drawingIds.includes(d.id)?'checked':'')} key={d.id}>
          <input type="checkbox" aria-label={'Select '+d.name} checked={scope.drawingIds.includes(d.id)} onChange={() => setScope({ drawingIds: toggle(scope.drawingIds,d.id) })}/><FileText size={24}/><div><strong>{d.name}</strong><span>{d.discipline} · {d.objects.length} text objects · {d.folder}</span></div><span className="muted">{d.copiedFrom?'Copy':'Source'}</span></label>)}</div>
        <p className="selection-count">{scope.drawingIds.length} drawings selected</p><LanguageSelect value={settings.target} label="Target language" onChange={v => update({target:v as TargetLanguage})}/></>}
      {step === 'settings' && <><div className="section-heading"><div><h3>Translation settings</h3><p>{scope.selection ? scope.selection.length+' selected objects' : scope.drawingIds.length+' drawing'+(scope.drawingIds.length>1?'s':'')} · Source language: English</p></div><span className="subtle-icon"><Layers size={23}/></span></div>
        <div className="settings-row"><LanguageSelect value={settings.target} label="Target language" onChange={v => update({target:v as TargetLanguage})}/><label className="field-label">Translation mode<select aria-label="Translation mode" value={settings.provider} onChange={e => update({provider:e.target.value as Settings['provider']})}><option value="demo">Offline demo</option><option value="gemini" disabled={!import.meta.env.VITE_GEMINI_API_KEY}>Gemini simulation</option></select></label></div>
        <div className="preset-bar"><label className="field-label">Reusable preset<select aria-label="Reusable preset" value={preset} onChange={e => setPreset(e.target.value)}><option value="">Custom settings</option>{state.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <button className="secondary small" disabled={!preset} onClick={() => { const chosen=state.presets.find(p=>p.id===preset); if(chosen) update(structuredClone(chosen.settings)); }}><Layers size={14}/> Load Preset</button><button className="secondary small" onClick={() => setSaveOpen(!saveOpen)}><Save size={14}/> Save Preset</button></div>
        {saveOpen&&<div className="inline-form"><input aria-label="Preset name" placeholder="Name this preset" value={presetName} onChange={e=>setPresetName(e.target.value)} maxLength={60}/><button className="primary small" disabled={!presetName.trim()} onClick={save}>Save settings</button></div>}
        <div className="safe-note"><ShieldCheck size={19}/><div><strong>Source text stays available</strong><p>Existing translations and manual edits are preserved unless you choose to replace them.</p></div></div>
        <label className="checkbox-row"><input type="checkbox" checked={settings.replaceExisting} onChange={e=>update({replaceExisting:e.target.checked})}/>Replace existing translations in {language.name}</label>
        <details className="settings-details"><summary><ListFilter size={17}/><span>Optional filters</span><span className="muted">{settings.types.length} types · {settings.layers.length} layers</span><ChevronRight size={16}/></summary>
          <div className="filter-grid"><section><h4>Object types</h4>{OBJECT_TYPES.map(type=><label className="checkbox-row" key={type}><input type="checkbox" checked={settings.types.includes(type)} onChange={()=>update({types:toggle(settings.types,type)})}/>{type==='BlockAttribute'?'Block Attributes':type==='TableCell'?'Table Cells':type}</label>)}</section><section><h4>Layers</h4>{layers.map(layer=><label className="checkbox-row" key={layer}><input type="checkbox" checked={settings.layers.includes(layer)} onChange={()=>update({layers:toggle(settings.layers,layer)})}/><code>{layer}</code></label>)}</section></div>
          <h4>Exclude obvious non-linguistic content</h4><label className="checkbox-row"><input type="checkbox" checked={settings.skipNumeric} onChange={e=>update({skipNumeric:e.target.checked})}/>Skip numeric-only text</label><label className="checkbox-row"><input type="checkbox" checked={settings.skipDimensions} onChange={e=>update({skipDimensions:e.target.checked})}/>Skip likely dimensions / levels</label><label className="checkbox-row"><input type="checkbox" checked={settings.skipCodes} onChange={e=>update({skipCodes:e.target.checked})}/>Skip drawing references / short codes</label>
          <div className="pattern-list">{settings.patterns.map((p,i)=><div key={i}><code>{p}</code><button className="icon-button" aria-label={'Remove pattern '+p} onClick={()=>update({patterns:settings.patterns.filter((_,n)=>n!==i)})}><Trash2 size={14}/></button></div>)}</div>
          <div className="inline-form"><input aria-label="Custom exclusion pattern" placeholder="Regular expression, e.g. ^REV\\s" value={pattern} onChange={e=>setPattern(e.target.value)} maxLength={120}/><button className="secondary small" disabled={!pattern.trim()} onClick={()=>{const error=validatePatterns([pattern]);if(error){setPatternError(error);return;}update({patterns:[...settings.patterns,pattern]});setPattern('');setPatternError('');}}><Plus size={14}/> Add pattern</button></div>{patternError&&<p className="error" role="alert">{patternError}</p>}
        </details>
        <details className="settings-details"><summary><LockKeyhole size={17}/><span>Project glossary</span><span className="muted">{state.glossary.length} terms</span><ChevronRight size={16}/></summary><GlossaryEditor entries={state.glossary} language={settings.target} onChange={glossary=>onState({...state,glossary})}/></details>
      </>}
      {step === 'preview' && <><div className="section-heading"><div><h3>Ready to translate to {language.name}</h3><p>{scope.drawingIds.length} drawing{scope.drawingIds.length>1?'s':''} · {settings.provider==='demo'?'Offline demo':'Gemini simulation'} · English source</p></div><span className="subtle-icon"><ShieldCheck size={25}/></span></div>
        <div className="preview-counts"><div><strong>{decisions.length}</strong><span>Detected</span></div><div className="included-count"><strong>{included.length}</strong><span>Included</span></div><div><strong>{excluded.length}</strong><span>Excluded / preserved</span></div><div className="blocked-count"><strong>{blocked.length}</strong><span>Locked / blocked</span></div></div>
        <div className="preview-reasons">{Object.entries(decisions.filter(d=>!d.eligible).reduce<Record<string,number>>((acc,d)=>({...acc,[d.reason]:(acc[d.reason]??0)+1}),{})).map(([reason,count])=><div key={reason}><span>{reason}</span><strong>{count}</strong></div>)}</div>
        <div className="preview-links"><button className="text-button" onClick={()=>setShowIncluded(!showIncluded)}>{showIncluded?'Hide':'View'} Included Items ({included.length})</button><button className="text-button" onClick={()=>setShowExcluded(!showExcluded)}>{showExcluded?'Hide':'View'} Excluded Items ({excluded.length+blocked.length})</button></div>
        {(showIncluded||showExcluded)&&<div className="preview-table"><table><thead><tr><th>Drawing</th><th>Original text</th><th>Decision</th></tr></thead><tbody>{decisions.filter(d=>d.eligible?showIncluded:showExcluded).map(d=><tr key={d.drawing.id+d.object.id}><td>{d.drawing.name}</td><td>{d.object.sourceText}</td><td>{d.eligible?(d.reason||'Included'):d.reason}</td></tr>)}</tbody></table></div>}
        <p className="mode-note">Glossary terms stay in the drawing. Only surrounding text is sent for translation.</p><h4 className="output-heading">Where should the translation be stored?</h4>
        <label className={'output-option '+(settings.output==='same'?'chosen':'')}><input type="radio" name="output" value="same" checked={settings.output==='same'} onChange={()=>update({output:'same'})}/><Layers size={24}/><div><strong>Add {language.name} to {scope.drawingIds.length>1?'each selected DWG':'this DWG'}</strong><p>Original source text will remain available. Switch languages in the drawing.</p></div></label>
        <label className={'output-option '+(settings.output==='copy'?'chosen':'')}><input type="radio" name="output" value="copy" checked={settings.output==='copy'} onChange={()=>update({output:'copy'})}/><Copy size={24}/><div><strong>Create translated {scope.drawingIds.length>1?'copies':'copy'}</strong><p>Keep separate files alongside the originals.</p><code>Translations/{language.suffix}/ · {'{OriginalName}_'+language.suffix+'.dwg'}</code></div></label>
        {settings.provider==='demo'&&<p className="mode-note"><Zap size={14}/> Offline demo uses prepared translations and predictable exception examples.</p>}
        {!included.length&&<p className="error" role="alert">No new objects are eligible. Adjust filters or enable replacement of existing translations.</p>}
      </>}
    </div>
    <div className="modal-footer"><button className="secondary" onClick={()=>step==='preview'?setStep('settings'):step==='settings'&&batch?setStep('scope'):onClose()}><ArrowLeft size={15}/>{step==='settings'&&!batch||step==='scope'?'Cancel':'Back'}</button><span className="muted">{step==='preview'?sentToMT+' objects sent to MT · '+(included.length-sentToMT)+' glossary only':'No translation starts before preview'}</span>
      {step==='preview'?<button className="primary" disabled={!included.length||!!invalid} onClick={()=>onRun(scope,settings)}><Zap size={16}/> Start translation</button>:<button className="primary" disabled={!scope.drawingIds.length||!!invalid} onClick={()=>setStep(step==='scope'?'settings':'preview')}>{step==='scope'?'Continue':'Review preview'}<ArrowRight size={16}/></button>}
    </div>
  </Modal>;
}
