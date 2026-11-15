import { DM_Sans, Fredoka, Fraunces } from 'next/font/google';
import { SolibraShell } from '@/components/solibra/shell';
import { DemoProvider } from '@/components/solibra/demo-provider';
import '@/components/solibra/solibra.css';
import '@/components/solibra/phase-two.css';

const body = DM_Sans({ subsets: ['latin'], variable: '--font-solibra-body' });
const display = Fredoka({ subsets: ['latin'], weight: '500', variable: '--font-solibra-display' });
const decorative = Fraunces({ subsets: ['latin'], weight: '400', variable: '--font-solibra-decorative' });

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`solibra ${body.variable} ${display.variable} ${decorative.variable}`}>
      <DemoProvider><SolibraShell>{children}</SolibraShell></DemoProvider>
    </div>
  );
}
