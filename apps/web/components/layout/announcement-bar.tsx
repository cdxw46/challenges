"use client";

import { useEffect, useState } from "react";

type Announcement = {
  id: string;
  message: string;
  ctaHref?: string | null;
  ctaLabel?: string | null;
};

export function AnnouncementBar({ items }: { items: Announcement[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % items.length);
    }, 3500);

    return () => window.clearInterval(timer);
  }, [items.length]);

  if (!items.length) return null;

  const active = items[index];

  return (
    <div className="announcement-bar">
      <div className="page-shell announcement-content">
        <span>{active.message}</span>
        {active.ctaHref && active.ctaLabel ? (
          <a href={active.ctaHref}>{active.ctaLabel}</a>
        ) : null}
      </div>
    </div>
  );
}
