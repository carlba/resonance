import { Navigate, Route, Routes } from 'react-router';
import { DownloadsPage } from '@/components/downloads/downloads-page.tsx';
import { SearchPage } from '@/components/search/search-page.tsx';
import { Toaster } from '@/components/ui/sonner.tsx';

export function App() {
  return (
    <>
      <Routes>
        <Route index element={<SearchPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
