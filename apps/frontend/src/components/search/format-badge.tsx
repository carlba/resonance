import { Badge } from '@/components/ui/badge.tsx';
import { isLosslessFormat } from '@/search/result-filters.ts';

export interface FormatBadgeProps {
  /** Lowercase extension, e.g. `flac`. */
  extension: string;
}

/** The file format, filled for lossless formats so they stand out from lossy ones. */
export function FormatBadge({ extension }: FormatBadgeProps) {
  const label = extension === '' ? 'Unknown' : extension.toUpperCase();
  return <Badge variant={isLosslessFormat(extension) ? 'default' : 'secondary'}>{label}</Badge>;
}
