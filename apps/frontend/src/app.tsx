import { Navigate, Route, Routes } from 'react-router';
import { SearchPage } from '@/components/search/search-page.tsx';

export function App() {
  return (
    <Routes>
      <Route index element={<SearchPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
