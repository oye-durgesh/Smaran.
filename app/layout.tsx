import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smaran Bolna',
  description: 'Your voice. Their care.',
};

export const viewport = { themeColor: '#39264B' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
