import { useId } from 'react';
import { Label } from '@/components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx';
import type { FormatOption } from '@/search/result-filters.ts';
import { isOneOf, SORT_KEYS, type SortKey } from '@/search/search-state.ts';

// Radix Select can't hold an empty value, so "every format" needs a value of its own.
const ALL_FORMATS = 'all';

const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Relevance',
  quality: 'Quality',
  speed: 'Speed',
  size: 'Size',
};

export interface ResultControlsProps {
  formatOptions: readonly FormatOption[];
  format?: string;
  sort: SortKey;
  onFormatChange: (format: string | undefined) => void;
  onSortChange: (sort: SortKey) => void;
}

/** The format filter and the sort order of the results. */
export function ResultControls({
  formatOptions,
  format,
  sort,
  onFormatChange,
  onSortChange,
}: ResultControlsProps) {
  const formatId = useId();
  const sortId = useId();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={formatId}>Format</Label>
        <Select
          value={format ?? ALL_FORMATS}
          onValueChange={value => onFormatChange(value === ALL_FORMATS ? undefined : value)}>
          <SelectTrigger id={formatId} className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FORMATS}>All formats</SelectItem>
            {formatOptions.map(option => (
              <SelectItem key={option.format} value={option.format}>
                {option.format.toUpperCase()} ({option.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={sortId}>Sort by</Label>
        <Select
          value={sort}
          onValueChange={value => {
            if (isOneOf(SORT_KEYS, value)) {
              onSortChange(value);
            }
          }}>
          <SelectTrigger id={sortId} className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map(sortKey => (
              <SelectItem key={sortKey} value={sortKey}>
                {SORT_LABELS[sortKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
