import { Route, Routes } from 'react-router';
import { Header } from './components/Header.tsx';
import { AboutPage } from './pages/AboutPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

export function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-xl bg-ink px-4 py-2.5 text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-10"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="mx-auto flex max-w-page flex-col gap-7 px-4 pb-16 sm:px-6">
        <Routes>
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}
