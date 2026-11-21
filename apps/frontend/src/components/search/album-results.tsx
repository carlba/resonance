import type { AlbumResult } from '@/api/search-schemas.ts';
import { AlbumCard } from './album-card.tsx';

export interface AlbumResultsProps {
  albums: readonly AlbumResult[];
}

export function AlbumResults({ albums }: AlbumResultsProps) {
  return (
    <ul aria-label="Albums" className="grid gap-4 lg:grid-cols-2">
      {albums.map(album => (
        // A user shares a directory once, so the pair identifies the album.
        <li key={`${album.username}\n${album.directory}`}>
          <AlbumCard album={album} />
        </li>
      ))}
    </ul>
  );
}
