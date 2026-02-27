import { Agentation } from 'agentation';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { Analytics } from 'components/analytics';
import { ThemeProvider } from 'components/theme-provider';

import { SITE_CONFIG } from 'lib/constants';

import './globals.css';

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_URL ?? process.env.R2_PUBLIC_URL;

function getOrigin(url?: string) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const R2_ORIGIN = getOrigin(R2_PUBLIC_URL);
const R2_DNS_PREFETCH = R2_ORIGIN ? `//${new URL(R2_ORIGIN).host}` : null;

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
  preload: true,
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
  preload: false, // Defer loading - mono font is less critical
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${SITE_CONFIG.domain}`),
  title: 'Photos',
  description: 'A personal photo archive from my travels.',
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Resource hints for image CDN */}
        {R2_ORIGIN && (
          <link rel="preconnect" href={R2_ORIGIN} crossOrigin="anonymous" />
        )}
        {R2_DNS_PREFETCH && <link rel="dns-prefetch" href={R2_DNS_PREFETCH} />}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <NuqsAdapter>
            {children}
            {modal}
          </NuqsAdapter>
          <Analytics />
          {process.env.NODE_ENV === 'development' && <Agentation />}
        </ThemeProvider>
      </body>
    </html>
  );
}
