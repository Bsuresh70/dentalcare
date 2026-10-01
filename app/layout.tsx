import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DentalGrowth AI',
  description: 'AI patient growth and revenue recovery platform for dental clinics'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
