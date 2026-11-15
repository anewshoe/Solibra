'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createNookSchema, inviteNookMemberSchema, type Nook, type NookInvitation } from '@/lib/nooks/types';
import { createNook, inviteNookMember, NookApiError } from '@/lib/frontend/nooks-client';
import { Mascot } from './shell';

type Invitee = { email: string; status: 'queued' | 'sending' | 'created' | 'error'; error?: string; invitation?: NookInvitation };
const steps = ['Name your Nook', 'Review and create', 'Your Nook is ready', 'Invite your people'];

function NookPreview({ name }: { name: string }) {
  return <aside className="create-nook-preview" aria-label="Decorative Nook preview">
    <div className="nook-arch" aria-hidden="true"><span className="nook-blush-border" /><span className="nook-door-space">{(['left', 'right'] as const).map(side => <span className={`nook-door nook-door-${side}`} key={side}>{[0, 1, 2, 3, 4].map(line => <span className="nook-door-line" style={{ top: `${31.57 + line * 10.5}%` }} key={line} />)}<span className="nook-handle" /></span>)}</span></div>
    <p className="create-preview-name">{name.trim() || 'Your little home for stories'}</p><small>Illustration only · Every Nook starts with a story.</small>
  </aside>;
}

export function CreateNookWorkflow() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [validation, setValidation] = useState<{ name?: string; description?: string }>({});
  const [nook, setNook] = useState<Nook | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<NookApiError | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, [step]);
  function validate() {
    const parsed = createNookSchema.safeParse({ name, description: description.trim() || null });
    const errors = parsed.success ? {} : {
      name: parsed.error.issues.some(issue => issue.path[0] === 'name') ? 'Give your Nook a name, up to 100 characters.' : undefined,
      description: parsed.error.issues.some(issue => issue.path[0] === 'description') ? 'Keep your description to 2,000 characters or fewer.' : undefined
    };
    setValidation(errors); return parsed;
  }
  async function create() {
    if (busyRef.current || nook) return;
    const parsed = validate(); if (!parsed.success) { setStep(0); return; }
    busyRef.current = true; setBusy(true); setError(null);
    try { const result = await createNook(parsed.data); setNook(result.nook); setStep(2); }
    catch (cause) { setError(cause instanceof NookApiError ? cause : new NookApiError('Unable to create your Nook. Your entries are still here.', 0)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function addInvitee(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    const parsed = inviteNookMemberSchema.safeParse({ email: email.trim().toLowerCase(), role: 'member' });
    if (!parsed.success) { setEmailError('Enter a valid email address, up to 255 characters.'); return; }
    if (invitees.some(person => person.email.toLowerCase() === parsed.data.email)) { setEmailError('That email is already on your list.'); return; }
    setInvitees(previous => [...previous, { email: parsed.data.email, status: 'queued' }]); setEmail(''); setEmailError('');
  }
  async function invite(onlyEmail?: string) {
    if (!nook || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    const pending = invitees.filter(person => (onlyEmail ? person.email === onlyEmail : person.status === 'queued') && person.status !== 'created');
    for (const person of pending) {
      setInvitees(previous => previous.map(item => item.email === person.email ? { ...item, status: 'sending', error: undefined } : item));
      try {
        const result = await inviteNookMember(nook.id, { email: person.email, role: 'member' });
        setInvitees(previous => previous.map(item => item.email === person.email ? { ...item, status: 'created', invitation: result.invitation } : item));
      } catch (cause) {
        const failure = cause instanceof NookApiError ? cause : new NookApiError('Invitation could not be created. Try again.', 0);
        setInvitees(previous => previous.map(item => item.email === person.email ? { ...item, status: 'error', error: failure.message } : item));
        if (failure.status === 401) setError(failure);
      }
    }
    busyRef.current = false; setBusy(false);
  }
  const heading = step === 0 ? 'Every story needs a little home.' : step === 1 ? 'A little home, ready for your stories.' : steps[step] + (step === 2 ? '.' : '');
  return <main id="main-content" className="sol-main create-nook-page">
    <nav className="sol-breadcrumb" aria-label="Breadcrumb"><Link href="/">Library</Link><span aria-hidden="true">/</span><span>Create Nook</span></nav>
    <ol className="create-progress" aria-label="Create Nook progress">{steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} data-complete={index < step}><span aria-hidden="true">{index + 1}</span>{label}{index === 3 && <small>Optional</small>}</li>)}</ol>
    <header className="create-heading"><p className="sol-eyebrow">A PLACE FOR YOUR PEOPLE</p><h1 ref={titleRef} tabIndex={-1}>{heading}</h1><p>{step < 2 ? 'Start with a name. The memories will make it yours.' : 'A little space to keep your shared memories close.'}</p></header>
    <div className="create-nook-grid"><section className="create-nook-panel" aria-label={steps[step]}>
      {step === 0 && <form noValidate onSubmit={event => { event.preventDefault(); if (validate().success) setStep(1); }}>
        <label htmlFor="nook-name">Nook name <span>(required)</span></label><input id="nook-name" value={name} onChange={event => setName(event.target.value)} onBlur={validate} autoComplete="off" required aria-invalid={!!validation.name} aria-describedby="nook-name-count nook-name-error" placeholder="e.g. Our Sunday table" />
        <small id="nook-name-count">{name.length} / 100 characters</small><p id="nook-name-error" className="create-error" role={validation.name ? 'alert' : undefined}>{validation.name}</p>
        <label htmlFor="nook-description">Description <span>(optional)</span></label><textarea id="nook-description" value={description} onChange={event => setDescription(event.target.value)} onBlur={validate} aria-invalid={!!validation.description} aria-describedby="nook-description-count nook-description-error" placeholder="What will you keep here together?" />
        <small id="nook-description-count">{description.length.toLocaleString()} / 2,000 characters</small><p id="nook-description-error" className="create-error" role={validation.description ? 'alert' : undefined}>{validation.description}</p>
        <div className="create-actions"><Link href="/" className="sol-outline-button">Cancel</Link><Button className="sol-button" type="submit">Continue</Button></div>
      </form>}
      {step === 1 && <><h2>{name.trim()}</h2><p className="create-description">{description.trim() || 'A little space for your shared memories.'}</p><div className="create-privacy"><LockKeyhole size={20} aria-hidden="true" /><p>Private to you and the people who join. Only Nook owners can manage its details and invitations.</p></div><p>This creates an additional Nook in your signed-in account. It won’t change your existing Nooks.</p><div className="create-actions"><button className="sol-outline-button" disabled={busy} onClick={() => { setStep(0); setError(null); }}>Back / Edit</button><Button className="sol-button" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create Nook'}</Button></div><Link className="sol-text-link" href="/" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>Cancel</Link></>}
      {step >= 2 && nook && <><div className="create-ready"><Mascot /><div><h2>{nook.name}</h2><p className="create-description">{nook.description || 'A little space for your shared memories.'}</p></div></div><p className="create-confirmation" role="status">Nook created · Reference #{nook.id}</p><p>Your Nook exists in your account. The Library currently shows sample Nooks, so it won’t appear there yet. Keep this reference for now.</p><p className="create-help">Refreshing clears this workflow’s display, not the Nook or invitations already created.</p></>}
      {step === 2 && <><div className="create-privacy"><LockKeyhole size={20} aria-hidden="true" /><p>It can start with just you. Invite your people whenever you’re ready.</p></div><div className="create-actions"><Link className="sol-outline-button" href="/">Skip for now</Link><Button className="sol-button" onClick={() => setStep(3)}>Invite your people</Button></div></>}
      {step === 3 && <><h3>Who would you like to join you?</h3><p>Invitations are optional. No invitation emails are sent; invited accounts can find pending invitations when that inbox is connected.</p><form noValidate onSubmit={addInvitee}><label htmlFor="invite-email">Email address</label><div className="create-email-row"><input id="invite-email" type="email" autoComplete="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} aria-invalid={!!emailError} aria-describedby="invite-email-error" /><Button type="submit" className="sol-button" disabled={busy}><Plus size={16} />Add</Button></div><p id="invite-email-error" className="create-error" role={emailError ? 'alert' : undefined}>{emailError}</p></form>
        <ul className="create-invitees" aria-label="Invitees">{invitees.map(person => <li key={person.email}><div><strong>{person.email}</strong><p role="status">{person.status === 'created' ? `Invitation created · Pending · #${person.invitation?.id}` : person.status === 'sending' ? 'Creating invitation…' : person.status === 'error' ? 'Invitation not confirmed' : 'Not submitted yet · Member'}</p>{person.error && <p className="create-error" role="alert">{person.error}</p>}</div>{person.status === 'queued' && <button type="button" className="sol-icon-button" aria-label={`Remove ${person.email}`} disabled={busy} onClick={() => setInvitees(previous => previous.filter(item => item.email !== person.email))}><X size={18} /></button>}{person.status === 'error' && <button className="sol-text-link" disabled={busy} onClick={() => void invite(person.email)}>Retry invitation</button>}</li>)}</ul>
        {invitees.some(person => person.status === 'queued') && <Button className="sol-button" disabled={busy} onClick={() => void invite()}>{busy ? 'Creating invitations…' : 'Create pending invitations'}</Button>}
        <p className="create-help">A failed invitation won’t undo your Nook. You can finish even if some invitations are not created.</p><div className="create-actions"><Link className="sol-outline-button" href="/" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>Finish / Return to Library</Link></div>
      </>}
      {error && <div className="create-error-box" role="alert"><p>{error.message}</p>{error.uncertain && <p>Don’t retry until you’ve checked whether it completed. There is no automatic retry.</p>}{error.status === 401 && <Link className="sol-text-link" href="/sign-in" target="_blank" rel="noopener noreferrer">Sign in in a new tab, then retry here</Link>}</div>}
    </section><NookPreview name={nook?.name || name} /></div>
  </main>;
}
