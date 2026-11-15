import Link from 'next/link';
import { BrandLogo } from '@/components/solibra/brand-logo';
import { AccountTheme } from '@/components/solibra/account-theme';
export default function NotFound() {
  return <AccountTheme><main className="account-auth"><Link href="/" aria-label="Solibra Library"><BrandLogo /></Link><section className="account-card"><h1>That story isn’t here.</h1><p>The page may have moved. Let’s head back to your library.</p><Link href="/" className="sol-outline-button">Return to Library</Link></section></main></AccountTheme>;
}
