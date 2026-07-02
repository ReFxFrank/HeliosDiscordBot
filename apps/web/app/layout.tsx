import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// Shown in link previews (Discord/Twitter embeds) and search results.
const TITLE = 'Solari — The All-in-One Discord Bot';
const DESCRIPTION =
  'Moderation, leveling, economy, giveaways and more — set up in minutes from a clean web dashboard.';

export const metadata: Metadata = {
  metadataBase: new URL('https://solari.gg'),
  title: {
    default: TITLE,
    template: '%s · Solari',
  },
  description: DESCRIPTION,
  applicationName: 'Solari',
  // Single source of truth for the favicon: drop the galaxy logo at
  // apps/web/public/solari-logo.png and it serves every icon slot below.
  icons: {
    icon: '/solari-logo.png',
    shortcut: '/solari-logo.png',
    apple: '/solari-logo.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Solari',
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://solari.gg',
    // Wide banner → Discord/Twitter render the large preview card.
    images: [{ url: '/solari-banner.png', width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/solari-banner.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
