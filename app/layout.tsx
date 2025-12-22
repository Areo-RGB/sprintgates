import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { RaceProvider } from './context/RaceProvider';
import WakeLock from './components/WakeLock';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Sprint Gate Timing',
  description: 'Precision timing for sprint gates',
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
        <RaceProvider>
          <WakeLock />
          {children}
        </RaceProvider>
      </body>
    </html>
  );
}
