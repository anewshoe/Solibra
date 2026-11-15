'use client';
import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inviteNookMemberSchema, type NookInvitation } from '@/lib/nooks/types';
import { inviteNookMember, NookApiError } from '@/lib/frontend/nooks-client';
type Invitee = { email: string; status: 'queued' | 'sending' | 'created' | 'error'; error?: string; invitation?: NookInvitation };

export function useInvitationQueue(nookId: number | null) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [busy,setBusy]=useState(false);const busyRef=useRef(false);const [error,setError]=useState<NookApiError|null>(null);
  function addInvitee(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    const parsed = inviteNookMemberSchema.safeParse({ email: email.trim().toLowerCase(), role: 'member' });
    if (!parsed.success) { setEmailError('Enter a valid email address, up to 255 characters.'); return; }
    if (invitees.some(person => person.email.toLowerCase() === parsed.data.email)) { setEmailError('That email is already on your list.'); return; }
    setInvitees(previous => [...previous, { email: parsed.data.email, status: 'queued' }]); setEmail(''); setEmailError('');
  }
  async function invite(onlyEmail?: string) {
    if (!nookId || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    const pending = invitees.filter(person => (onlyEmail ? person.email === onlyEmail : person.status === 'queued') && person.status !== 'created');
    for (const person of pending) {
      setInvitees(previous => previous.map(item => item.email === person.email ? { ...item, status: 'sending', error: undefined } : item));
      try {
        const result = await inviteNookMember(nookId, { email: person.email, role: 'member' });
        setInvitees(previous => previous.map(item => item.email === person.email ? { ...item, status: 'created', invitation: result.invitation } : item));
      } catch (cause) {
        const failure = cause instanceof NookApiError ? cause : new NookApiError('Invitation could not be created. Try again.', 0);
        setInvitees(previous => previous.map(item => item.email === person.email ? { ...item, status: 'error', error: failure.message } : item));
        if (failure.status === 401) setError(failure);
      }
    }
    busyRef.current = false; setBusy(false);
  }
  return { email,setEmail,emailError,invitees,setInvitees,busy,error,addInvitee,invite };
}
export function InvitationQueueFields(queue: ReturnType<typeof useInvitationQueue>) {
  const {email,setEmail,emailError,invitees,setInvitees,busy,addInvitee,invite}=queue;
  return <><form noValidate onSubmit={addInvitee}><label htmlFor="invite-email">Email address</label><div className="create-email-row"><input id="invite-email" type="email" autoComplete="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} aria-invalid={!!emailError} aria-describedby="invite-email-error" /><Button type="submit" className="sol-button" disabled={busy}><Plus size={16} />Add</Button></div><p id="invite-email-error" className="create-error" role={emailError ? 'alert' : undefined}>{emailError}</p></form>
        <ul className="create-invitees" aria-label="Invitees">{invitees.map(person => <li key={person.email}><div><strong>{person.email}</strong><p role="status">{person.status === 'created' ? `Invitation created · Pending · #${person.invitation?.id}` : person.status === 'sending' ? 'Creating invitation…' : person.status === 'error' ? 'Invitation not confirmed' : 'Not submitted yet · Member'}</p>{person.error && <p className="create-error" role="alert">{person.error}</p>}</div>{person.status === 'queued' && <button type="button" className="sol-icon-button" aria-label={`Remove ${person.email}`} disabled={busy} onClick={() => setInvitees(previous => previous.filter(item => item.email !== person.email))}><X size={18} /></button>}{person.status === 'error' && <button className="sol-text-link" disabled={busy} onClick={() => void invite(person.email)}>Retry invitation</button>}</li>)}</ul>
        {invitees.some(person => person.status === 'queued') && <Button className="sol-button" disabled={busy} onClick={() => void invite()}>{busy ? 'Creating invitations…' : 'Create pending invitations'}</Button>}
</>;
}
