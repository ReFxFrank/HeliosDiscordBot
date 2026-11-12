import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { BRAND, FEATURES, IS_DEFAULT_BRAND } from '@refx/shared';
import './globals.css';

// Shown in link previews (Discord embeds) and the browser tab.
const TITLE = `${BRAND.name} — ${BRAND.community} Dashboard`;
const DESCRIPTION = `Configure ${BRAND.name}, the Discord bot for the ${BRAND.community}${FEATURES.fivem ? ' FiveM' : ''} community.`;
// Icon slots use the instance logo; without one the browser falls back to none.
const ICONS = BRAND.logo ? [BRAND.logo] : [];

/**
 * Non-default instances re-tint the dashboard from one colour: the bright and
 * strong variants are mixed from it, and every tint in globals.css derives from
 * these three tokens.
 */
const THEME: CSSProperties | undefined = IS_DEFAULT_BRAND
  ? undefined
  : ({
      '--color-brand': BRAND.colorHex,
      '--color-brand-bright': `color-mix(in srgb, ${BRAND.colorHex} 72%, white)`,
      '--color-brand-strong': `color-mix(in srgb, ${BRAND.colorHex} 78%, black)`,
    } as CSSProperties);

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
  icons: BRAND.logo ? { icon: BRAND.logo, shortcut: BRAND.logo, apple: BRAND.logo } : undefined,
  // Dashboard pages sit behind Discord sign-in; keep them out of search results.
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: TITLE,
    description: DESCRIPTION,
    images: ICONS.map((url) => ({ url, alt: BRAND.community })),
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
    images: ICONS,
  },
};

export const viewport: Viewport = {
  themeColor: BRAND.colorHex,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={THEME}>
      <body>{children}</body>
    </html>
  );
}
