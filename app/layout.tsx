import './globals.css';

import { SITE_CONFIG } from 'lib/constants';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import PlausibleProvider from 'next-plausible';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Photography Portfolio',
  description: 'Photography Portfolio',
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PlausibleProvider domain={SITE_CONFIG.domain}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </PlausibleProvider>
      </body>
    </html>
  );
};

export default RootLayout;
