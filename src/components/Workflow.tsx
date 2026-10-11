import { useState } from 'react';
import { ArrowLeft, ArrowRight, Copy, FileText, Layers, Languages, Search, X } from 'lucide-react';
import { defaultSettings, previewTranslation, searchDrawingFiles } from '../core';
import { LANGUAGES } from '../types';
import type { PersistedState, Scope, Settings, TargetLanguage } from '../types';
import { Empty, Modal } from './UI';
import LanguagePicker from './LanguagePicker';
import { hasOfflineFixtures } from '../languages';

export default function Workflow({ state, initialScope, batch, targets, provider, onClose, onRun }: {
  state: PersistedState; initialScope: Scope; batch: boolean; targets: TargetLanguage[]; provider: Settings['provider'];
  onClose: () => void; onRun: (scope: Scope, settings: Settings) => void;
}) {
  const [scope, setScope] = useState(initialScope);
  const [choosing, setChoosing] = useState(batch);
  const [fileQuery, setFileQuery] = useState('');
  const visibleDrawings = searchDrawingFiles(state.drawings, fileQuery);
  const [settings, setSettings] = useState<Settings>({ ...defaultSettings(provider), targets });
  const multiple = settings.targets.length > 1;
  const preview = previewTranslation(state.drawings, scope, settings.targets);
  const title = choosing ? 'Choose drawings' : batch ? 'Translate drawings' : 'Translate ' + state.drawings.find(d => d.id === scope.drawingIds[0])?.name;
  return <Modal title={title} onClose={onClose}>
    <div className="translation-dialog-body">
      {choosing ? <>
        <label className="search-input batch-search"><Search size={15}/><input type="search" aria-label="Search files" placeholder="Search filenames…" value={fileQuery} onChange={event => setFileQuery(event.target.value)}/>{fileQuery && <button className="icon-button" aria-label="Clear file search" onClick={() => setFileQuery('')}><X size={14}/></button>}</label>
        <div className="batch-selection-summary"><strong>{scope.drawingIds.length} files selected</strong><span>{visibleDrawings.length} of {state.drawings.length} files</span></div>
        <div className="batch-list">{visibleDrawings.map(d => <label className={'batch-file ' + (scope.drawingIds.includes(d.id) ? 'checked' : '')} key={d.id}>
        <input type="checkbox" aria-label={'Select ' + d.name} checked={scope.drawingIds.includes(d.id)}
          onChange={() => setScope({ drawingIds: scope.drawingIds.includes(d.id) ? scope.drawingIds.filter(id => id !== d.id) : [...scope.drawingIds, d.id] })}/>
        <FileText size={23}/><div><strong>{d.name}</strong><span>{LANGUAGES[d.language].name} · {d.folder}</span></div>
      </label>)}</div>
        {!visibleDrawings.length && <Empty>No files match your search.</Empty>}
        <p className="batch-search-hint">Selections stay selected while you search.</p>
      </> : <>
        <p className="translation-message">Translate the selected drawing text to another language.</p>
        <LanguagePicker selected={settings.targets} onChange={next => setSettings(previous => ({ ...previous, targets: next, output: next.length > 1 ? 'copy' : previous.output }))}/>
        {!settings.targets.length && <p className="target-validation">Select at least one target language.</p>}
        <section className="mt-preview" aria-label="MT API preview" aria-live="polite">
          <div className="mt-preview-heading"><span>MT API preview</span><strong><span data-testid="mt-preview-total">{preview.total}</span> text submission{preview.total === 1 ? '' : 's'}</strong></div>
          <div className="mt-preview-languages">{preview.perTarget.map(item => <span key={item.target} data-preview-target={item.target}>{LANGUAGES[item.target].name}<strong>{item.count}</strong></span>)}</div>
          <p>Each eligible text counts once per selected language, including previously translated text.</p>
          <small>{provider === 'demo' ? 'Offline demo simulates these submissions. No API requests.' : 'These texts will be sent when you choose Translate. Nothing has been sent yet.'}</small>
        </section>
        {provider === 'demo' && settings.targets.some(language => !hasOfflineFixtures(language)) && <p className="offline-language-note">Offline fixtures cover English, French, German and Simplified Chinese. Other selected languages require Gemini; offline attempts will be reported as failed.</p>}
        <div className="simple-output-options">
          <label className={'output-option ' + (settings.output === 'same' ? 'chosen' : '') + (multiple ? ' disabled' : '')}>
            <input type="radio" name="output" disabled={multiple} checked={settings.output === 'same'} onChange={() => setSettings(s => ({ ...s, output: 'same' }))}/>
            <Layers size={22}/><div><strong>Translate original file</strong><p>Replace current text. Before/after text stays in report history.</p></div>
          </label>
          <label className={'output-option ' + (settings.output === 'copy' ? 'chosen' : '')}>
            <input type="radio" name="output" checked={settings.output === 'copy'} onChange={() => setSettings(s => ({ ...s, output: 'copy' }))}/>
            <Copy size={22}/><div><strong>{multiple ? 'Create translated copies' : 'Create translated copy'}</strong><p>{multiple ? 'Keep the input unchanged and create a separate file for each language.' : 'Keep the input file unchanged and create a separate output.'}</p></div>
          </label>
        </div>
        {multiple && <p className="multiple-output-note">Each file has one language. Multiple targets require separate translated copies.</p>}
      </>}
    </div>
    <div className="modal-footer">
      <button className="secondary" onClick={onClose}>Cancel</button>
      {choosing ? <button className="primary" disabled={!scope.drawingIds.length} onClick={() => setChoosing(false)}>Continue <ArrowRight size={15}/></button> :
        <div className="button-group">{batch && <button className="secondary" onClick={() => setChoosing(true)}><ArrowLeft size={14}/> Drawings</button>}
          <button className="primary" disabled={!settings.targets.length} onClick={() => onRun(scope, settings)}><Languages size={16}/> Translate</button></div>}
    </div>
  </Modal>;
}
