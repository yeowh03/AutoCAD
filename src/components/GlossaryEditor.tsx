import { useState } from 'react';
import { LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { uid } from '../core';
import { LANGUAGES } from '../types';
import type { GlossaryEntry, TargetLanguage } from '../types';

export default function GlossaryEditor({ entries, language, onChange }: { entries: GlossaryEntry[]; language: TargetLanguage; onChange: (entries: GlossaryEntry[]) => void }) {
  const [kind, setKind] = useState<'protected' | 'preferred'>('protected');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    if (!source.trim() || (kind === 'preferred' && !target.trim())) { setError('Enter a source term' + (kind === 'preferred' ? ' and its preferred translation.' : '.')); return; }
    if (entries.some(e => e.source.toLowerCase() === source.trim().toLowerCase() && (e.kind === 'protected' || kind === 'protected' || e.language === language))) { setError('This term is already in the glossary for this language.'); return; }
    onChange([...entries, { id: uid(), kind, source: source.trim(), ...(kind === 'preferred' ? { target: target.trim(), language } : {}) }]);
    setSource(''); setTarget(''); setError('');
  };
  return <div className="glossary-editor"><p className="muted">Glossary terms stay local and are not sent for translation. Protected terms keep their exact spelling; preferred {LANGUAGES[language].name} translations are inserted locally.</p>
    <div className="glossary-list">{entries.filter(e => e.kind === 'protected' || e.language === language).map(e => <div className="glossary-entry" key={e.id}>
      <span>{e.kind === 'protected' ? <LockKeyhole size={13}/> : <span className="term-arrow">→</span>} <strong>{e.source}</strong>{e.target && <><span>→</span><span>{e.target}</span></>}</span>
      <button className="icon-button" aria-label={'Remove ' + e.source} onClick={() => onChange(entries.filter(g => g.id !== e.id))}><Trash2 size={14}/></button>
    </div>)}</div>
    <div className="glossary-form"><select aria-label="Glossary term type" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setError(''); }}><option value="protected">Do not translate</option><option value="preferred">Preferred translation</option></select>
      <input aria-label="Glossary source term" placeholder="Source term, e.g. AHU-01" value={source} onChange={e => setSource(e.target.value)} maxLength={120}/>
      {kind === 'preferred' && <input aria-label="Preferred target term" placeholder={'Preferred ' + LANGUAGES[language].name + ' term'} value={target} onChange={e => setTarget(e.target.value)} maxLength={250}/>}
      <button className="secondary small" onClick={add}><Plus size={14}/> Add term</button></div>{error && <p className="error" role="alert">{error}</p>}
  </div>;
}
