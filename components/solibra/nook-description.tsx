'use client';

import { useId, useState } from 'react';
import { updateNookSchema, type Nook, type NookResponse } from '@/lib/nooks/types';

// Supply only after reading the real Nook with the existing authenticated session.
// The backend must still authorize the write; this prop only controls presentation.
export interface DescriptionEditor {
  nook: Pick<Nook, 'id' | 'role'>;
  save: (nookId: number, description: string | null) => Promise<NookResponse>;
}
export function NookDescription({ description, editor }: { description?: string | null; editor?: DescriptionEditor }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<{ value: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const value = saved ? saved.value : description;
  const canEdit = editor?.nook.role === 'owner' && Number.isSafeInteger(editor.nook.id) && editor.nook.id > 0;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || !editor || busy) return;
    const parsed = updateNookSchema.safeParse({ description: draft.trim() || null });
    if (!parsed.success) { setError('Keep the description to 2,000 characters or fewer.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await editor.save(editor.nook.id, parsed.data.description ?? null);
      if (result.nook.id !== editor.nook.id) throw new Error('Unexpected Nook response');
      setSaved({ value: result.nook.description }); setEditing(false);
    } catch { setError('The description could not be updated. Check your connection and owner access, then try again. Your draft is still here.'); }
    finally { setBusy(false); }
  }
  return <div className="nook-description">
    <p>{value?.trim() || 'A little space for your shared memories.'}</p>
    {canEdit && !editing && <button className="description-edit sol-text-link" onClick={() => { setDraft(value || ''); setError(null); setEditing(true); }}>Edit description</button>}
    {canEdit && editing && <form onSubmit={submit} aria-label="Edit Nook description">
      <label htmlFor={fieldId}>Nook description</label>
      <textarea id={fieldId} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} aria-describedby={`${fieldId}-hint${error ? ` ${fieldId}-error` : ''}`} aria-invalid={!!error} />
      <small id={`${fieldId}-hint`}>{draft.length.toLocaleString()} / 2,000 characters · Leave blank to clear.</small>
      {error && <p id={`${fieldId}-error`} role="alert">{error}</p>}
      <div className="description-actions"><button className="sol-outline-button" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save description'}</button><button type="button" className="sol-text-link" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>Cancel</button></div>
    </form>}
  </div>;
}
