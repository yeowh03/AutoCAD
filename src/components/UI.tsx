import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = dialog.current;
    root?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && close.current) { e.preventDefault(); close.current(); }
      if (e.key !== 'Tab' || !root) return;
      const controls = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length);
      if (!controls.length) { e.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length-1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', listener);
    return () => { document.removeEventListener('keydown', listener); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop"><div role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={dialog} className={'modal ' + (wide?'modal-wide':'')}>
    <div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{onClose && <button aria-label="Close dialog" className="icon-button" onClick={onClose}><X size={20}/></button>}</div>{children}
  </div></div>;
}
export function Badge({ value }: { value: string }) { return <span className={'badge badge-'+value.toLowerCase().replace(/\s/g,'-')}>{value}</span>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
