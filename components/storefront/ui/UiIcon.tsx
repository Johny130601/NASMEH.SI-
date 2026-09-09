/** Hand-drawn inline icons (no copied assets). Stroke = currentColor. */
export type UiIconName =
  | "search"
  | "cart"
  | "menu"
  | "close"
  | "chevron-down"
  | "account"
  | "discount"
  | "star";

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
