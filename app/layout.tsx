import './globals.css';
import { withoutPasswordHash } from '@/lib/frontend/account';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.solibra.club'),
  title: 'Solibra',
  description: 'A private, multilingual library for preserving memories, sharing stories, and connecting generations.',
  openGraph: {
    type: 'website',
    siteName: 'Solibra',
    title: 'Solibra — Every memory has more than one voice.',
    description: 'A private, multilingual library for preserving memories, sharing stories, and connecting generations.',
    url: 'https://www.solibra.club',
    images: [{
      url: '/solibra/solibra-social-preview.png',
      width: 1200,
      height: 630,
      alt: 'Solibra wordmark with its waving yellow sun mascot and colorful ribbon on a dark burgundy background.'
    }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Solibra — Every memory has more than one voice.',
    description: 'A private, multilingual library for preserving memories, sharing stories, and connecting generations.',
    images: [{
      url: '/solibra/solibra-social-preview.png',
      alt: 'Solibra wordmark with its waving yellow sun mascot and colorful ribbon on a dark burgundy background.'
    }]
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white ${manrope.className}`}
    >
      <body className="min-h-[100dvh] bg-gray-50">
        <SWRConfig
          value={{
            fallback: {
              // We do NOT await here
              // Only components that read this data will suspend
              '/api/user': getUser().then(withoutPasswordHash),
              '/api/team': getTeamForUser()
            }
          }}
        >
          {children}
        </SWRConfig>
      </body>
    </html>
  );
}
