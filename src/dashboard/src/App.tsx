import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/toast';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import JobsPage from '@/pages/JobsPage';
import JobDetailPage from '@/pages/JobDetailPage';
import ScoutPage from '@/pages/ScoutPage';
import ConfigPage from '@/pages/ConfigPage';
import HistoryPage from '@/pages/HistoryPage';
import DocsPage from '@/pages/DocsPage';
import LevelUpPage from '@/pages/LevelUpPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="jobs" element={<JobsPage />} />
                                <Route path="jobs/:id" element={<JobDetailPage />} />
                <Route path="scout" element={<ScoutPage />} />
                <Route path="config" element={<ConfigPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="docs" element={<DocsPage />} />
                                <Route path="level-up" element={<LevelUpPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
