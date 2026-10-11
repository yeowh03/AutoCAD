import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { LANGUAGES, hasOfflineFixtures, searchLanguages } from '../languages';
import type { TargetLanguage } from '../types';

export default function LanguagePicker({ selected, onChange }: { selected: TargetLanguage[]; onChange: (languages: TargetLanguage[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(80);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const matches = searchLanguages(query);
  const visible = matches.slice(0, limit);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const show = () => { setQuery(''); setLimit(80); setOpen(true); };
  const toggle = (code: string) => onChange(selected.includes(code) ? selected.filter(language => language !== code) : [...selected, code]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="language-picker" ref={wrapper} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <span className="field-label" id="target-languages-label">Target languages</span>
    <button ref={trigger} type="button" className="language-picker-trigger" role="combobox" aria-label="Target languages"
      aria-expanded={open} aria-controls="target-language-list" aria-haspopup="listbox"
      onClick={() => open ? close() : show()} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); if (open) input.current?.focus(); else show(); } }}>
      <span>Add a language…</span><ChevronDown size={15}/>
    </button>
    {open && <div className="language-picker-menu">
      <label className="search-input language-search"><Search size={15}/><input ref={input} type="search" aria-label="Search languages"
        placeholder="Search name, native name, or code…" value={query}
        onChange={event => { setQuery(event.target.value); setLimit(80); }}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); results.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); } }}/>
        {query && <button type="button" className="icon-button" aria-label="Clear language search" onClick={() => { setQuery(''); setLimit(80); input.current?.focus(); }}><X size={14}/></button>}
      </label>
      <div className="language-search-results" id="target-language-list" role="listbox" aria-label="Languages" aria-multiselectable="true" ref={results}>
        {visible.map(language => <button type="button" role="option" aria-label={language.name} aria-selected={selected.includes(language.code)}
          tabIndex={-1} key={language.code} className="language-option" onClick={() => toggle(language.code)}
          onKeyDown={event => {
            const options = Array.from(results.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
            const index = options.indexOf(event.currentTarget);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              if (event.key === 'ArrowUp' && index === 0) input.current?.focus();
              else options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
            }
          }}>
          <span className="language-check">{selected.includes(language.code) && <Check size={13}/>}</span>
          <span className="language-option-name"><strong>{language.name}</strong>{language.nativeName && <small>{language.nativeName}</small>}</span>
          <span className="language-option-meta">{hasOfflineFixtures(language.code) && <small>Offline demo</small>}<code>{language.code}</code></span>
        </button>)}
        {!matches.length && <p className="language-no-results">No languages match your search.</p>}
      </div>
      <div className="language-menu-footer"><span>{matches.length.toLocaleString()} language{matches.length === 1 ? '' : 's'}</span>
        {visible.length < matches.length && <button type="button" className="text-button" onClick={() => setLimit(value => value + 80)}>Show more</button>}
        <button type="button" className="secondary small" onClick={close}>Done</button>
      </div>
    </div>}
    <div className="target-language-chips" aria-label="Selected languages">
      {selected.map(code => <span data-selected-language={code} key={code}><Check size={13}/>{LANGUAGES[code].name}
        <button type="button" className="icon-button" aria-label={'Remove ' + LANGUAGES[code].name} onClick={() => toggle(code)}><X size={13}/></button>
      </span>)}
      {!selected.length && <span className="no-languages-selected">No languages selected</span>}
    </div>
  </div>;
}
