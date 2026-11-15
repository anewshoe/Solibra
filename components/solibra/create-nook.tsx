'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createNookSchema, type Nook } from '@/lib/nooks/types';
import { createNook, NookApiError } from '@/lib/frontend/nooks-client';
import { NOOK_DOOR_COLORS, creationTransitionMs, type NookDoorColor } from '@/lib/frontend/nook-colors';
import { InvitationQueueFields, useInvitationQueue } from './invitation-queue';
import { refreshNookLists } from '@/lib/frontend/nook-cache';
import { SolibraEmote } from './solibra-emote';

const steps = ['Customize your Nook', 'Review and create', 'Invite your people', 'Your Nook is ready'];

export function NookPreview({ name, color, opening }: { name: string; color: NookDoorColor; opening: boolean }) {
  return <aside className="create-nook-preview" data-door-color={color} data-opening={opening} aria-label="Decorative Nook preview">
    <div className="nook-arch" aria-hidden="true"><span className="nook-blush-border" /><span className="nook-door-space">{(['left', 'right'] as const).map(side => <span className={`nook-door nook-door-${side}`} key={side}>{[0, 1, 2, 3, 4].map(line => <span className="nook-door-line" style={{ top: `${31.57 + line * 10.5}%` }} key={line} />)}<span className="nook-handle" /></span>)}</span></div>
    <p className="create-preview-name">{name.trim() || 'Your little home for stories'}</p>
  </aside>;
}

export function CreateNookWorkflow({ viewerId }: {viewerId?:number} = {}) {
  const [step, setStep] = useState(0);
  const [color, setColor] = useState<NookDoorColor>('pink');
  const [opening, setOpening] = useState(false);
  const transitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; if (transitionRef.current !== null) clearTimeout(transitionRef.current); }; }, []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [validation, setValidation] = useState<{ name?: string; description?: string }>({});
  const [nook, setNook] = useState<Nook | null>(null);
  const [creating, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<NookApiError | null>(null);
  const queue = useInvitationQueue(nook?.id ?? null);
  const { invitees } = queue;
  const busy = creating || queue.busy;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, [step]);
  function validate() {
    const parsed = createNookSchema.safeParse({ name, description: description.trim() || null, doorColor: color });
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
    try {
      const result = await createNook(parsed.data);
      if (!mountedRef.current) return;
      setNook(result.nook); setOpening(true);
      void refreshNookLists(viewerId).catch(() => {});
      const duration = creationTransitionMs(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const advance = () => { transitionRef.current = null; setOpening(false); setStep(2); busyRef.current = false; setBusy(false); };
      if (duration) transitionRef.current = setTimeout(advance, duration); else advance();
    }
    catch (cause) { setError(cause instanceof NookApiError ? cause : new NookApiError('Unable to create your Nook. Your entries are still here.', 0)); }
    finally { if (transitionRef.current === null && mountedRef.current) { busyRef.current = false; setBusy(false); } }
  }
  const heading = step === 3 ? 'Your Nook is ready.' : steps[step];
  const confirmed = invitees.filter(person => person.status === 'created');
  const unfinished = invitees.filter(person => person.status !== 'created');
  return <main id="main-content" className="sol-main create-nook-page">
    <nav className="sol-breadcrumb" aria-label="Breadcrumb"><Link href="/">Library</Link><span aria-hidden="true">/</span><span>Create Nook</span></nav>
    <ol className="create-progress" aria-label="Create Nook progress">{steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} data-complete={index < step}><span aria-hidden="true">{index + 1}</span>{label}{index === 2 && <small>Optional</small>}</li>)}</ol>
    <header className="create-heading"><p className="sol-eyebrow">A PLACE FOR YOUR PEOPLE</p><h1 ref={titleRef} tabIndex={-1}>{heading}</h1><p>{step === 0 ? 'Give your shared memories a name and a little color.' : step === 1 ? 'One last look before making a home for your stories.' : 'A little space to keep your shared memories close.'}</p></header>
    <div className="create-nook-grid"><section className="create-nook-panel" aria-label={steps[step]}>
      {step === 0 && <form noValidate onSubmit={event => { event.preventDefault(); if (validate().success) setStep(1); }}>
        <label htmlFor="nook-name">Nook name <span>(required)</span></label><input id="nook-name" value={name} onChange={event => setName(event.target.value)} onBlur={validate} autoComplete="off" required aria-invalid={!!validation.name} aria-describedby="nook-name-count nook-name-error" placeholder="Insert a family or friend group name!" />
        <small id="nook-name-count">{name.length} / 100 characters</small><p id="nook-name-error" className="create-error" role={validation.name ? 'alert' : undefined}>{validation.name}</p>
        <label htmlFor="nook-description">Description <span>(optional)</span></label><textarea id="nook-description" value={description} onChange={event => setDescription(event.target.value)} onBlur={validate} aria-invalid={!!validation.description} aria-describedby="nook-description-count nook-description-error" placeholder="What kind of memories do you want to collect?" />
        <small id="nook-description-count">{description.length.toLocaleString()} / 2,000 characters</small><p id="nook-description-error" className="create-error" role={validation.description ? 'alert' : undefined}>{validation.description}</p>
        <fieldset className="create-door-colors"><legend>Choose your door color</legend><div>{NOOK_DOOR_COLORS.map(option => <label key={option} data-door-color={option}><input type="radio" name="door-color" value={option} checked={color === option} onChange={() => setColor(option)} /><span className="create-color-swatch" aria-hidden="true" /><span>{option[0].toUpperCase() + option.slice(1)}</span></label>)}</div><p className="create-help">Your chosen color is saved for everyone in this Nook.</p></fieldset>
        <div className="create-actions"><Link href="/" className="sol-outline-button">Cancel</Link><Button className="sol-button" type="submit">Continue</Button></div>
      </form>}
      {step === 1 && <><h2>{name.trim()}</h2><p className="create-description">{description.trim() || 'A little space for your shared memories.'}</p><div className="create-privacy"><LockKeyhole size={20} aria-hidden="true" /><p>Private to you and the people who join. Only Nook owners can manage its details and invitations.</p></div><p>This creates an additional Nook in your signed-in account. It won’t change your existing Nooks.</p><div className="create-actions"><button className="sol-outline-button" disabled={busy} onClick={() => { setStep(0); setError(null); }}>Back / Edit</button><Button className="sol-button" disabled={busy} onClick={() => void create()}>{opening ? 'Nook created…' : busy ? 'Creating…' : 'Create Nook'}</Button></div><Link className="sol-text-link" href="/" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>Cancel</Link></>}
      {step >= 2 && nook && <><div className="create-ready"><SolibraEmote variant="celebrate" size="clamp(64px, 16vw, 88px)" /><div><h2>{nook.name}</h2><p className="create-description">{nook.description || 'A little space for your shared memories.'}</p></div></div><p className="create-confirmation" role="status">Nook created · Reference #{nook.id}</p><p>Your Nook is in your Library. Open it whenever you’re ready.</p><p className="create-help">Refreshing clears this workflow’s display, not the Nook or invitations already created.</p></>}
      {step === 2 && <><h3>Who would you like to join you?</h3><p>Invitations are optional. No invitation emails are sent; invited accounts can find pending invitations in their Library invitation inbox.</p>{InvitationQueueFields(queue)}
        <p className="create-help">A failed invitation won’t undo your Nook. You can finish even if some invitations are not created.</p><div className="create-actions"><button className="sol-outline-button" disabled={busy} onClick={() => setStep(3)}>Skip invitations</button><Button className="sol-button" disabled={busy} onClick={() => setStep(3)}>Continue to Ready</Button></div>
      </>}
      {step === 3 && <div className="create-final-summary"><p>Your stories have a little home. You can start with just you.</p><p className="create-help">Your selected door color is saved to your Nook.</p>{confirmed.length > 0 && <><h3>Invitations created · {confirmed.length}</h3><ul>{confirmed.map(person => <li key={person.email}>{person.email} · Pending</li>)}</ul></>}{unfinished.length > 0 && <p role="status">{unfinished.length} invitation(s) were not confirmed or submitted. Your Nook is still created.</p>}<div className="create-actions"><button className="sol-outline-button" onClick={() => setStep(2)}>Back to invitations</button><Link href="/" className="sol-button sol-outline-button">Return to Library</Link>{nook && <Link className="sol-outline-button" href={`/circles/${nook.id}`}>Enter Nook →</Link>}</div></div>}
      {opening && <p role="status">Your Nook was created. Opening the doors…</p>}
      {(error || queue.error) && <div className="create-error-box" role="alert"><p>{(error || queue.error)?.message}</p>{(error || queue.error)?.uncertain && <p>Don’t retry until you’ve checked whether it completed. There is no automatic retry.</p>}{(error || queue.error)?.status === 401 && <Link className="sol-text-link" href="/sign-in" target="_blank" rel="noopener noreferrer">Sign in in a new tab, then retry here</Link>}</div>}
    </section><NookPreview name={nook?.name || name} color={color} opening={opening} /></div>
  </main>;
}
