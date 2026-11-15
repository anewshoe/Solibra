'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, Suspense, useContext, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Home, LogOut, X } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { signOut } from '@/app/(login)/actions';
import type { User } from '@/lib/db/schema';

const NoticeContext = createContext<(title: string, description: string) => void>(() => {});
export const useNotice = () => useContext(NoticeContext);

export function DesignIcon({ name }: { name: 'library' | 'nooks' | 'messages' | 'user' | 'bell' | 'search' }) {
  const size = name === 'bell' ? 24 : 20;
  return <img src={`/solibra/${name}.svg`} width={size} height={size} alt="" aria-hidden="true" />;
}

export function Mascot({ listening = false }: { listening?: boolean }) {
  return (
    <span className={`sol-mascot ${listening ? 'sol-mascot-listening' : ''}`} aria-hidden="true">
      <img src={`/solibra/mascot${listening ? '-listening' : ''}.svg`} width={listening ? 42.2697 : 36.3994} height={listening ? 37.8 : 36.45} alt="" />
    </span>
  );
}

function AccountMenu() {
  const { data: user } = useSWR<User | null>('/api/user', (url: string) => fetch(url).then((res) => res.json()));
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  if (!user) return <Link className="sol-account" href="/sign-in" aria-label="Sign in"><Avatar className="size-12"><AvatarImage src="/solibra/sofia.png" alt="" /><AvatarFallback>S</AvatarFallback></Avatar></Link>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="sol-account" aria-label="Account menu">
        <Avatar className="size-12"><AvatarFallback>{(user.name || user.email).slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href="/dashboard"><Home /> Account settings</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={handleSignOut}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SolibraShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inNook = pathname.startsWith('/circles/');
  const inMessages = pathname.startsWith('/messages/');
  const circleId = inNook || inMessages ? pathname.split('/')[2] : 'rivera-family';
  const [notice, setNotice] = useState<{ title: string; description: string } | null>(null);
  const showNotice = (title: string, description: string) => setNotice({ title, description });
  const notifications = () => showNotice('Notifications', 'This preview uses sample Nooks and memories. Live notifications will appear here once connected.');

  return (
    <NoticeContext.Provider value={showNotice}>
      <a href="#main-content" className="sol-skip">Skip to content</a>
      <header className={`sol-header ${inNook ? 'sol-header-nook' : ''} ${inMessages ? 'sol-header-conversation' : ''}`}>
        <div className="sol-header-inner">
          <Link href="/" className="sol-logo" aria-label="Solibra Library"><Mascot /><span>solibra</span></Link>
          <nav aria-label="Main navigation" className="sol-desktop-nav">
            <Link href="/" aria-current={(pathname === '/' || inNook) ? 'page' : undefined}><DesignIcon name="library" />Library</Link>
            <Link href={`/messages/${circleId}`} aria-current={inMessages ? 'page' : undefined}><DesignIcon name="messages" />Messages</Link>
          </nav>
          <div className="sol-header-actions">
            <Link href={inNook ? `${pathname.split('/memories/')[0]}#memory-search` : '/?search=1#library-search'} className="sol-icon-button sol-header-search" aria-label={inNook ? 'Search this Nook' : 'Search Nooks'}><DesignIcon name="search" /></Link>
            <button className="sol-icon-button" onClick={notifications} aria-label="Notifications"><DesignIcon name="bell" /></button>
            <div className="sol-desktop-account"><Suspense fallback={<span className="sol-account" />}><AccountMenu /></Suspense></div>
          </div>
        </div>
      </header>
      {children}
      <footer className="sol-footer"><p>A private place for the people who matter.</p><p>Your memories stay yours. Always.</p></footer>
      <nav aria-label="Mobile navigation" className="sol-bottom-nav">
        <Link href="/" aria-current={(pathname === '/' || inNook) ? 'page' : undefined}><DesignIcon name="library" />Library</Link>
        <Link href={`/messages/${circleId}`} aria-current={inMessages ? 'page' : undefined}><DesignIcon name="messages" />Messages</Link>
        <Link href="/dashboard"><DesignIcon name="user" />You</Link>
      </nav>
      <Dialog.Root open={!!notice} onOpenChange={(open) => { if (!open) setNotice(null); }}>
          <Dialog.Overlay className="sol-dialog-overlay" />
          <Dialog.Content className="sol-dialog">
            <Dialog.Title>{notice?.title}</Dialog.Title>
            <Dialog.Description>{notice?.description}</Dialog.Description>
            <Dialog.Close className="sol-icon-button sol-dialog-close" aria-label="Close"><X size={20} /></Dialog.Close>
            <Dialog.Close asChild><Button className="sol-button">Got it</Button></Dialog.Close>
          </Dialog.Content>
      </Dialog.Root>
    </NoticeContext.Provider>
  );
}
