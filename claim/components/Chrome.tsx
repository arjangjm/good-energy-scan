import Link from 'next/link';
import Smiley from './Smiley';

export function Brand() {
  return (
    <Link href="/" className="brand">
      <Smiley size={30} />
      <span>Good Energy</span>
    </Link>
  );
}
export function Footer() {
  return (
    <footer>
      Test build. 18+ only. <Link href="/terms">Terms</Link>
    </footer>
  );
}
