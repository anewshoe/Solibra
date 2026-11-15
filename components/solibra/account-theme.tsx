import { DM_Sans, Fredoka, Fraunces } from 'next/font/google';
import './solibra.css';
import './account.css';

const body = DM_Sans({ subsets: ['latin'], variable: '--font-solibra-body' });
const display = Fredoka({ subsets: ['latin'], weight: '500', variable: '--font-solibra-display' });
const decorative = Fraunces({ subsets: ['latin'], weight: '400', variable: '--font-solibra-decorative' });

// Theme only: auth/settings keep their own navigation; no duplicate SolibraShell.
export function AccountTheme({ children }: { children: React.ReactNode }) {
  return <div className={`solibra account-theme ${body.variable} ${display.variable} ${decorative.variable}`}>{children}</div>;
}
