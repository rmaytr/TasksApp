/** Small stroke icon set, drawn on a 20px grid so every glyph shares one visual weight. */
const PATHS = {
  home: 'M3.5 9.5L10 4l6.5 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1Z',
  menu: 'M4 6h12M4 10h12M4 14h12',
  sparkle: 'M10 3.5l1.4 3.6 3.6 1.4-3.6 1.4L10 13.5l-1.4-3.6L5 8.5l3.6-1.4ZM15.5 13l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z',
  bell: 'M6 8.5a4 4 0 0 1 8 0v3l1.5 2.5h-11L6 11.5ZM8.5 16.5a1.6 1.6 0 0 0 3 0',
  arrowRight: 'M4 10h12M11.5 5.5L16 10l-4.5 4.5',
  dots: 'M5 10h.01M10 10h.01M15 10h.01',
  radar: 'M10 10m-7.5 0a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0M10 10m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M10 10l5-5',
  list: 'M7 5.5h10M7 10h10M7 14.5h10M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01',
  map: 'M8 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 9.2l4-3.2M10 10.8l4 3.2M6 10H3M15.5 5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M15.5 15m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  cloud: 'M6 15.5h8.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A2.9 2.9 0 0 0 6 15.5Z',
  lock: 'M5.5 9h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM7 9V6.5a3 3 0 0 1 6 0V9',
  link: 'M8.5 11.5l3-3M7 9.5l-1.5 1.5a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 10.5l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L9.5 7',
  repeat: 'M4 9V8a3 3 0 0 1 3-3h8l-2-2M16 11v1a3 3 0 0 1-3 3H5l2 2',
  focus: 'M10 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M13 3h2.5A1.5 1.5 0 0 1 17 4.5V7M17 13v2.5a1.5 1.5 0 0 1-1.5 1.5H13M7 17H4.5A1.5 1.5 0 0 1 3 15.5V13',
  reset: 'M3.5 10a6.5 6.5 0 1 0 2-4.7M3.5 3.5v3.5H7',
  plus: 'M10 4v12M4 10h12',
  close: 'M5 5l10 10M15 5L5 15',
  settings:
    'M10 12.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5ZM16.2 12.3l1.2.9-1.6 2.8-1.4-.6a6 6 0 0 1-1.6.9l-.2 1.5H9.4l-.2-1.5a6 6 0 0 1-1.6-.9l-1.4.6-1.6-2.8 1.2-.9a6 6 0 0 1 0-1.8l-1.2-.9 1.6-2.8 1.4.6a6 6 0 0 1 1.6-.9l.2-1.5h3.2l.2 1.5a6 6 0 0 1 1.6.9l1.4-.6 1.6 2.8-1.2.9a6 6 0 0 1 0 1.8Z',
  import: 'M10 3v9M6.5 8.5L10 12l3.5-3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14',
  trash: 'M4 6h12M8 6V4.5h4V6M5.5 6l.7 10a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1l.7-10',
  chevron: 'M7.5 5l5 5-5 5',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  clock: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M10 6v4l2.5 2',
  flag: 'M5 17V3.5M5 4h9l-2 3.5 2 3.5H5',
  search: 'M9 9m-5.5 0a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0M13 13l4 4',
  zoomReset: 'M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4',
  play: 'M7 4.5v11l9-5.5z',
  pause: 'M7 4.5v11M13 4.5v11',
  arrowIn: 'M15 5l-8 8M7 7v6h6',
  arrowOut: 'M7 13l8-8M9 5h6v6',
  eye: 'M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5ZM10 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  eyeOff: 'M3 3l14 14M8.2 5.3A7.4 7.4 0 0 1 10 5c4.8 0 7.5 5 7.5 5a12 12 0 0 1-2 2.6M5.4 6.6A12 12 0 0 0 2.5 10s2.7 5 7.5 5a7 7 0 0 0 3-.7',
  download: 'M10 3v10M6 9l4 4 4-4M4 17h12',
  calendar: 'M4.5 5h11a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3.5 8.5h13M7 3v3.5M13 3v3.5',
  sort: 'M6 4v12M3.5 13.5L6 16l2.5-2.5M14 16V4M11.5 6.5L14 4l2.5 2.5',
  hourglass: 'M6 3.5h8M6 16.5h8M7 3.5c0 3.5 6 3.5 6 6.5s-6 3-6 6.5M13 3.5c0 3.5-6 3.5-6 6.5s6 3 6 6.5',
  target: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M10 10m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M10 10h.01',
  skip: 'M5 5l6 5-6 5ZM14.5 5v10',
  note: 'M5.5 3.5h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1ZM7.5 7.5h5M7.5 10.5h5M7.5 13.5h3',
  chevronLeft: 'M12.5 5l-5 5 5 5',
  arrowDown: 'M10 4v12M5.5 11.5L10 16l4.5-4.5',
  doneAll: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M6.8 10.2l2.2 2.2 4.4-4.6',
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
