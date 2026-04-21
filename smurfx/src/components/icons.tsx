type P = React.SVGProps<SVGSVGElement> & { size?: number };

const make = (path: React.ReactNode) =>
  function Icon({ size = 20, ...rest }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {path}
      </svg>
    );
  };

export const Search = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>
);
export const Heart = make(
  <path d="M12 21s-7-4.35-7-10a4.5 4.5 0 0 1 8-2.83A4.5 4.5 0 0 1 19 11c0 5.65-7 10-7 10Z" />
);
export const Bag = make(
  <>
    <path d="M5 7h14l-1.5 13a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8Z" />
    <path d="M9 7V5a3 3 0 0 1 6 0v2" />
  </>
);
export const User = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>
);
export const Menu = make(
  <>
    <path d="M3 6h18" />
    <path d="M3 12h18" />
    <path d="M3 18h18" />
  </>
);
export const Close = make(
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </>
);
export const Chevron = make(<path d="m9 6 6 6-6 6" />);
export const Star = make(
  <path d="M12 2.5l3 6.4 6.8.8-5 4.7 1.4 6.8L12 17.8l-6.2 3.4 1.4-6.8-5-4.7L9 8.9Z" />
);
export const Check = make(<path d="M5 12l5 5L20 7" />);
export const Plus = make(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
);
export const Minus = make(<path d="M5 12h14" />);
export const Trash = make(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1.4 14a2 2 0 0 1-2 1.8h-7.2a2 2 0 0 1-2-1.8L5 6" />
  </>
);
export const Truck = make(
  <>
    <path d="M3 7h11v9H3z" />
    <path d="M14 10h4l3 3v3h-7" />
    <circle cx="7.5" cy="18" r="1.6" />
    <circle cx="17.5" cy="18" r="1.6" />
  </>
);
export const Shield = make(
  <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6Z" />
);
export const Sparkle = make(
  <>
    <path d="M12 3v6" />
    <path d="M12 15v6" />
    <path d="M3 12h6" />
    <path d="M15 12h6" />
  </>
);
