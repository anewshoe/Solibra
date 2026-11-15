'use client';
import { useRef, useState } from 'react';
import { updateNookSchema, type Nook, type NookResponse, type UpdateNookRequest } from '@/lib/nooks/types';
import { NOOK_DOOR_COLORS, type NookDoorColor } from '@/lib/frontend/nook-colors';

export function NookSettings({ nook, save }: { nook: Nook; save: (data: UpdateNookRequest) => Promise<NookResponse> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<NookDoorColor>('pink');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  if (nook.role !== 'owner' || !Number.isSafeInteger(nook.id) || nook.id <= 0) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    const parsed = updateNookSchema.safeParse({ name, doorColor: color });
    if (!parsed.success) { setError('Give your Nook a name of 1–100 characters and choose a door color.'); return; }
    locked.current = true; setBusy(true); setError('');
    try { await save(parsed.data); setOpen(false); setNotice('Nook updated.'); }
    catch { setError('The update could not be confirmed. Your draft is kept. Refresh your Nook to check its current details before retrying.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section className="nook-settings" aria-label="Nook settings">
    <button className="sol-outline-button" type="button" aria-expanded={open} disabled={busy} onClick={() => { if (!open) { setName(nook.name); setColor(nook.doorColor); setError(''); setNotice(''); } setOpen(!open); }}>Edit Nook</button>
    {notice && <p role="status">{notice}</p>}
    {open && <form className="create-nook-panel" aria-label="Edit Nook" onSubmit={submit} noValidate>
      <label>Nook name<input value={name} maxLength={100} required disabled={busy} onChange={event => setName(event.target.value)}/></label><small>{name.length} / 100 characters</small>
      <fieldset className="create-door-colors" disabled={busy}><legend>Door color</legend><div>{NOOK_DOOR_COLORS.map(value => <label key={value}><input type="radio" name={`nook-color-${nook.id}`} value={value} checked={color === value} onChange={() => setColor(value)}/><span className="create-color-swatch nook-settings-swatch" data-book-color={value} aria-hidden="true"/><span>{value[0].toUpperCase() + value.slice(1)}</span></label>)}</div></fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="real-memory-actions"><button className="sol-button" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save Nook'}</button><button className="sol-outline-button" type="button" disabled={busy} onClick={() => { setOpen(false); setError(''); }}>Cancel</button></div>
    </form>}
  </section>;
}
