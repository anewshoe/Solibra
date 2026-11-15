import { getUser } from '@/lib/db/queries';
import { DM_Sans, Fredoka, Fraunces } from 'next/font/google';
import { SolibraShell } from '@/components/solibra/shell';
import { DemoProvider } from '@/components/solibra/demo-provider';
import '@/components/solibra/solibra.css';
import '@/components/solibra/phase-two.css';
import '@/components/solibra/real-nooks.css';
import '@/components/solibra/account.css';
import '@/components/solibra/create-nook.css';

const body = DM_Sans({ subsets: ['latin'], variable: '--font-solibra-body' });
const display = Fredoka({ subsets: ['latin'], weight: '500', variable: '--font-solibra-display' });
const decorative = Fraunces({ subsets: ['latin'], weight: '400', variable: '--font-solibra-decorative' });

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <div className={`solibra ${body.variable} ${display.variable} ${decorative.variable}`}>
      <DemoProvider key={user?.id ?? 'signed-out'}><SolibraShell>{children}</SolibraShell></DemoProvider>
    </div>
  );
}
