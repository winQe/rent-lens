import { Link, NavLink } from 'react-router';

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2.5 font-medium ${isActive ? 'bg-ink text-white' : 'text-ink hover:bg-soft'}`;

export function Header() {
  return (
    <header className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Link to="/" className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-ink">
        <span className="grid size-9 place-items-center rounded-xl bg-plum" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            aria-hidden="true"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
            <path d="M7.5 11.5 10.5 9l3 2.5" />
          </svg>
        </span>
        RentLens
      </Link>
      <nav aria-label="Main" className="flex flex-wrap gap-2">
        <NavLink to="/" end className={navLink}>
          Find by budget
        </NavLink>
        <NavLink to="/about" className={navLink}>
          About the data
        </NavLink>
      </nav>
    </header>
  );
}
