import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx';
import {
  countActiveFilters,
  isValidTrackCountRange,
  type TrackCountRange,
} from '@/search/result-filters.ts';
import {
  isOneOf,
  parseTrackCount,
  QUALITY_PRESETS,
  type AdvancedFilterState,
  type QualityPreset,
  type SearchMode,
} from '@/search/search-state.ts';

const QUALITY_PRESET_LABELS: Record<QualityPreset, string> = {
  any: 'Any',
  '256': '≥ 256 kbps',
  '320': '≥ 320 kbps',
  cd: 'CD',
  lossless: 'Lossless',
  hires: 'Hi-Res',
};

type AdvancedFiltersChange = (change: Partial<AdvancedFilterState>) => void;

export interface AdvancedFiltersProps {
  filters: AdvancedFilterState;
  mode: SearchMode;
  onFiltersChange: AdvancedFiltersChange;
}

interface QualityFilterProps {
  quality: QualityPreset;
  onFiltersChange: AdvancedFiltersChange;
}

function QualityFilter({ quality, onFiltersChange }: QualityFilterProps) {
  const qualityId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={qualityId}>Quality</Label>
      <Select
        value={quality}
        onValueChange={value => {
          if (isOneOf(QUALITY_PRESETS, value)) {
            onFiltersChange({ quality: value });
          }
        }}>
        <SelectTrigger id={qualityId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {QUALITY_PRESETS.map(preset => (
            <SelectItem key={preset} value={preset}>
              {QUALITY_PRESET_LABELS[preset]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface RipLogFilterProps {
  hasRipLog: boolean;
  onFiltersChange: AdvancedFiltersChange;
}

function RipLogFilter({ hasRipLog, onFiltersChange }: RipLogFilterProps) {
  const ripLogId = useId();
  return (
    // Lines the checkbox up with the inputs next to it, which sit under a label.
    <div className="flex items-center gap-2 sm:h-8 sm:self-end">
      <Checkbox
        id={ripLogId}
        checked={hasRipLog}
        onCheckedChange={checked => onFiltersChange({ hasRipLog: checked === true })}
      />
      <Label htmlFor={ripLogId}>Has rip log</Label>
    </div>
  );
}

interface TrackCountFilterProps {
  range: TrackCountRange;
  onFiltersChange: AdvancedFiltersChange;
}

function TrackCountFilter({ range, onFiltersChange }: TrackCountFilterProps) {
  const minId = useId();
  const maxId = useId();
  const errorId = useId();
  const isValid = isValidTrackCountRange(range);
  const invalidProps = isValid ? {} : { 'aria-invalid': true, 'aria-describedby': errorId };

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Track count</legend>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={minId} className="text-xs text-muted-foreground">
            Min
          </Label>
          <Input
            id={minId}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={range.minTracks ?? ''}
            onChange={event => onFiltersChange({ minTracks: parseTrackCount(event.target.value) })}
            {...invalidProps}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor={maxId} className="text-xs text-muted-foreground">
            Max
          </Label>
          <Input
            id={maxId}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={range.maxTracks ?? ''}
            onChange={event => onFiltersChange({ maxTracks: parseTrackCount(event.target.value) })}
            {...invalidProps}
          />
        </div>
      </div>
      {!isValid && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          The minimum can't be more than the maximum
        </p>
      )}
    </fieldset>
  );
}

/**
 * A panel, collapsed at first, with the filters beyond format; its trigger counts the active ones.
 * The rip log and track-count filters only apply to albums, so the Tracks view leaves them out.
 */
export function AdvancedFilters({ filters, mode, onFiltersChange }: AdvancedFiltersProps) {
  const activeCount = countActiveFilters(filters, mode);

  return (
    <Collapsible className="flex flex-col gap-3">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="group w-full justify-between sm:w-fit">
          {activeCount === 0 ? 'Advanced filters' : `Advanced filters (${activeCount})`}
          <ChevronDown
            aria-hidden
            className="transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid items-start gap-4 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
          <QualityFilter quality={filters.quality} onFiltersChange={onFiltersChange} />
          {mode === 'albums' && (
            <>
              <TrackCountFilter range={filters} onFiltersChange={onFiltersChange} />
              <RipLogFilter hasRipLog={filters.hasRipLog} onFiltersChange={onFiltersChange} />
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
