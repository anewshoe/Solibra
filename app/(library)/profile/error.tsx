'use client';
import Link from 'next/link';
export default function ProfileError({ reset }: { reset: () => void }) {
  return <main id="main-content" className="sol-main account-page"><h1>Your account is unavailable right now.</h1><p role="alert">We couldn’t load this page. Please try again or sign in again.</p><button className="sol-outline-button" onClick={reset}>Try again</button><Link href="/sign-in" className="sol-outline-button">Sign in</Link></main>;
}
