import './globals.css';
export const metadata = {
  title: 'Dictionary reports · Subtitle Bridge',
  description: 'Private dictionary review workspace.',
  robots: { index: false, follow: false },
  icons: { icon: '/subtitle-bridge-icon.svg' },
};
export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
