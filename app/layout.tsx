import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import PlausibleProvider from 'next-plausible';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { SITE_CONFIG } from 'lib/constants';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${SITE_CONFIG.domain}`),
  title: 'Photography Portfolio',
  description: 'A personal archive of my street photography while travelling.',
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html lang="en">
      <head>
        {/* Resource hints for image CDN */}
        <link rel="dns-prefetch" href="//r2.photography.mislavjc.com" />
        <link
          rel="preconnect"
          href={process.env.NEXT_PUBLIC_R2_PUBLIC_URL}
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PlausibleProvider
          domain={SITE_CONFIG.domain}
          scriptProps={{ strategy: 'lazyOnload' } as never}
        >
          <NuqsAdapter>{children}</NuqsAdapter>
        </PlausibleProvider>
      </body>
    </html>
  );
};

export default RootLayout;
