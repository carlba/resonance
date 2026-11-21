import { CircleCheck, CircleSlash, Gauge, ListOrdered } from 'lucide-react';
import type { UserAvailability } from '@/api/search-schemas.ts';
import { cn } from '@/lib/utils.ts';
import { formatSpeed } from '@/lib/format.ts';

export interface AvailabilityProps {
  availability: UserAvailability;
  className?: string;
}

/** How soon the sharing user is likely to start an upload: free slot, queue and speed. */
export function Availability({ availability, className }: AvailabilityProps) {
  const { hasFreeUploadSlot, queueLength, uploadSpeed } = availability;
  const SlotIcon = hasFreeUploadSlot ? CircleCheck : CircleSlash;

  return (
    <ul
      aria-label="Availability"
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}>
      <li
        className={cn(
          'flex items-center gap-1',
          hasFreeUploadSlot ? 'text-foreground' : 'text-muted-foreground'
        )}>
        <SlotIcon aria-hidden className="size-4" />
        {hasFreeUploadSlot ? 'Free slot' : 'No free slot'}
      </li>
      <li className="flex items-center gap-1 text-muted-foreground">
        <ListOrdered aria-hidden className="size-4" />
        Queue {queueLength}
      </li>
      <li className="flex items-center gap-1 text-muted-foreground">
        <Gauge aria-hidden className="size-4" />
        {formatSpeed(uploadSpeed)}
      </li>
    </ul>
  );
}
