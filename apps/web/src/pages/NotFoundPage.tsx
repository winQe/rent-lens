import { Link } from 'react-router';
import { link } from '../ui.ts';

export function NotFoundPage() {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-4xl">Page not found</h1>
      <Link to="/" className={link}>
        Go to the budget search
      </Link>
    </section>
  );
}
