import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { BRAND } from '@refx/shared';
import './globals.css';

// Shown in link previews (Discord embeds) and the browser tab.
const TITLE = `${BRAND.name} — ${BRAND.community} Dashboard`;
const DESCRIPTION = `Configure ${BRAND.name}, the Discord bot for the ${BRAND.community} FiveM community.`;

/** Absolute base for OG/Twitter image URLs; only set when the deploy URL is known. */
function metadataBase(): URL | undefined {
  const raw = process.env.AUTH_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: TITLE,
    template: `%s · ${BRAND.name}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND.name,
  // Single source of truth for every icon slot: apps/web/public/refx-logo.png.
  icons: {
    icon: '/refx-logo.png',
    shortcut: '/refx-logo.png',
    apple: '/refx-logo.png',
  },
  // Dashboard pages sit behind Discord sign-in; keep them out of search results.
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/refx-logo.png', alt: BRAND.community }],
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/refx-logo.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#0072ff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
