import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { lazy, Suspense, useEffect, useState } from 'react';
import { startApp } from './app/session.ts';
import { Toasts } from './components/Toasts.tsx';
import { useUi } from './store/ui.ts';
import { ThemeRoot } from './theme/ThemeRoot.tsx';
import { Landing } from './views/Landing.tsx';
import { Privacy } from './views/Privacy.tsx';

const Workspace = lazy(() => import('./views/Workspace.tsx'));

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

function Loading() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }} role="status" aria-label="Loading">
      <CircularProgress />
    </Box>
  );
}

function Routes() {
  const path = usePath();
  const status = useUi((s) => s.status);
  useEffect(() => {
    if (path !== '/privacy') void startApp();
  }, [path]);

  if (path === '/privacy') return <Privacy />;
  if (status === 'loading') return <Loading />;
  if (status === 'signedOut') return <Landing returnTo={path.startsWith('/app') ? path + location.search : '/app'} />;
  if (path !== '/app') {
    history.replaceState(null, '', '/app' + location.search);
  }
  return (
    <Suspense fallback={<Loading />}>
      <Workspace />
    </Suspense>
  );
}

export function App() {
  return (
    <ThemeRoot>
      <Routes />
      <Toasts />
    </ThemeRoot>
  );
}
