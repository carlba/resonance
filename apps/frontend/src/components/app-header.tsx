import { NavLink } from 'react-router';
import { cn } from '@/lib/utils.ts';

const NAV_LINKS = [
  { to: '/', label: 'Search', end: true },
  { to: '/downloads', label: 'Downloads', end: false },
] as const;

export interface AppHeaderProps {
  description: string;
}

export function AppHeader({ description }: AppHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Resonance</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <nav aria-label="Main" className="flex gap-4 text-sm">
        {NAV_LINKS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'underline-offset-4 hover:underline',
                isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
              )
            }>
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
