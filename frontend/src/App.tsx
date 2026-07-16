import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { LoginForm } from './ui/LoginForm';
import { clearSession } from './auth/session';

// Route components are code-split so each screen's JS loads on demand.
const EventsPage = lazy(() => import('./routes/EventsPage'));
const EventPage = lazy(() => import('./routes/EventPage'));
const OrderPage = lazy(() => import('./routes/OrderPage'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">Ticketing Labs</Link>
        <button className="link" onClick={() => clearSession()}>Log out</button>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

export function App() {
  const loggedIn = useAuth();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {loggedIn ? (
          <Shell>
            <Suspense fallback={<p className="muted">Loading…</p>}>
              <Routes>
                <Route path="/" element={<EventsPage />} />
                <Route path="/events/:id" element={<EventPage />} />
                <Route path="/orders/:id" element={<OrderPage />} />
                <Route path="*" element={<p>Not found. <Link to="/">Home</Link></p>} />
              </Routes>
            </Suspense>
          </Shell>
        ) : (
          <LoginForm />
        )}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
