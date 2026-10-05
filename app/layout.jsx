import './globals.css';
export const metadata = {
  title: 'Dictionary reports · Subtitle Bridge',
  description: 'Private dictionary review workspace.',
  robots: { index: false, follow: false },
};
export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
