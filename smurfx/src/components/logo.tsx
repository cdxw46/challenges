import Link from "next/link";
import clsx from "clsx";

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="SMURFX inicio"
      className={clsx(
        "h-display select-none text-2xl tracking-[0.18em]",
        dark ? "text-white" : "text-ink",
        className
      )}
    >
      SMURF<span className="text-smurf-500">X</span>
    </Link>
  );
}
