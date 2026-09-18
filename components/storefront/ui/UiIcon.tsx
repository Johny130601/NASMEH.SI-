/** Hand-drawn inline icons (no copied assets). Stroke = currentColor. */
export type UiIconName =
  | "search"
  | "cart"
  | "menu"
  | "close"
  | "chevron-down"
  | "account"
  | "discount"
  | "star"
  | "check"
  | "truck"
  | "lock"
  | "shield"
  | "arrow-right"
  | "clock"
  | "box";

export function UiIcon({
  name,
  className = "h-5 w-5",
}: {
  name: UiIconName;
  className?: string;
}) {
  const paths: Record<UiIconName, React.ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.8-3.8" />
      </>
    ),
    cart: (
      <>
        <path d="M5 7h14l-1.3 9.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5 7Z" />
        <path d="M8.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    account: <><circle cx="12" cy="7" r="3.5" /><path d="M4.5 21v-2.5a7.5 7.5 0 0 1 15 0V21" /></>,
    discount: <><path d="m12 2 2.5 2 3.2-.2.5 3.2 2.6 1.9-1.1 3.1 1.1 3.1-2.6 1.9-.5 3.2-3.2-.2-2.5 2-2.5-2-3.2.2-.5-3.2-2.6-1.9 1.1-3.1-1.1-3.1L6.3 7l.5-3.2 3.2.2z" /><path d="m9 15 6-6" /><circle cx="9" cy="9" r=".75" /><circle cx="15" cy="15" r=".75" /></>,
    star: (
      <path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2L6.4 20l1.3-6.2L3 9.5l6.3-.7L12 3Z" />
    ),
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    truck: (
      <>
        <path d="M3 6.5h11v10H3z" />
        <path d="M14 10h3.6L21 13.4V16.5h-7" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="17" cy="18" r="1.6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 4.6 3 8.2 7 10 4-1.8 7-5.4 7-10V6l-7-3Z" />
        <path d="m9.3 12.2 2 2 3.6-4" />
      </>
    ),
    "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    box: (
      <>
        <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
        <path d="m4 7 8 4 8-4M12 11v10" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
