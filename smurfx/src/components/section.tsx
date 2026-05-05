import clsx from "clsx";

export function Section({
  title,
  eyebrow,
  cta,
  children,
  className
}: {
  title?: React.ReactNode;
  eyebrow?: string;
  cta?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("py-16", className)}>
      <div className="container-x">
        {(title || eyebrow || cta) && (
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              {eyebrow && (
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-smurf-500">{eyebrow}</div>
              )}
              {title && <h2 className="h-display text-3xl md:text-4xl">{title}</h2>}
            </div>
            {cta && (
              <a
                href={cta.href}
                className="text-sm font-semibold uppercase tracking-wider text-ink/70 hover:text-ink"
              >
                {cta.label} →
              </a>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
