import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const origin = process.env.PUBLIC_ORIGIN;
const trustedOrigin =
  origin && /^https:\/\/[^/]+$/.test(origin) ? new URL(origin) : undefined;
export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
  metadataBase: trustedOrigin,
  title: 'Tree Control · Project Dashboard',
  description:
    'Tree translocation project progress, approvals, quality and nursery readiness in one controlled workspace.',
  openGraph: {
    title: 'Tree Control',
    description: 'Tree Translocation Project',
    ...(trustedOrigin
      ? { images: [new URL('/og.png', trustedOrigin).href] }
      : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tree Control',
    description: 'Tree Translocation Project',
    ...(trustedOrigin
      ? { images: [new URL('/og.png', trustedOrigin).href] }
      : {}),
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
