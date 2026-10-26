// One stroke icon set (24px grid, 1.75 stroke) so every glyph shares weight and corner style.

import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  today: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M8.5 14.5h3" /></>,
  train: <><path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" /></>,
  food: <><path d="M4 12h16a8 8 0 0 1-16 0Z" /><path d="M9 8c0-1.5 1-2 1-3.5M14 8c0-1.5 1-2 1-3.5" /></>,
  progress: <><path d="M4 19.5h16" /><path d="M5 15.5l4.5-4.5 3.5 3 6-6.5" /><path d="M15 7.5h4v4" /></>,
  review: <><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4.5V3h6v1.5M9 11l2 2 4-4M9 17h6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></>,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></>,
  timer: <><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V10M9.5 3h5" /></>,
  cloudOff: <><path d="M7.5 18.5H17a3.5 3.5 0 0 0 .8-6.9A6 6 0 0 0 7 8.6" /><path d="M5.4 10.6A4 4 0 0 0 7.5 18.5" /><path d="M3 3l18 18" /></>,
  alert: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.5v.5" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.5v.5" /></>,
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" />,
  scale: <><rect x="3.5" y="4" width="17" height="16.5" rx="3" /><path d="M8 9.5a6 6 0 0 1 8 0L13 12" /></>,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 'md', label }: { name: IconName; size?: 'sm' | 'md'; label?: string }) {
  return (
    <svg
      className={`icon${size === 'sm' ? ' sm' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths[name]}
    </svg>
  );
}
