"use client";

import Link from "next/link";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

type ButtonBaseProps = {
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
  children: React.ReactNode;
};

type ButtonProps = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href">;

const variants: Record<NonNullable<ButtonBaseProps["variant"]>, string> = {
  primary: "bg-[var(--primary)] text-white hover:bg-[#463ca1]",
  secondary: "bg-white text-black border border-black/10 hover:bg-[var(--primary-soft)]",
  ghost: "bg-transparent text-white border border-white/20 hover:bg-white/10",
};

const sizes: Record<NonNullable<ButtonBaseProps["size"]>, string> = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-6 text-sm",
  lg: "h-14 px-7 text-base",
};

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button({ className, variant = "primary", size = "md", href, children, ...props }, ref) {
    const classes = cn(
      "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-transform duration-200 hover:-translate-y-0.5",
      variants[variant],
      sizes[size],
      className,
    );

    if (href) {
      return (
        <Link
          href={href}
          className={classes}
          ref={ref as React.ForwardedRef<HTMLAnchorElement>}
          {...(props as Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href">)}
        >
          {children}
        </Link>
      );
    }

    return (
      <button
        ref={ref as React.ForwardedRef<HTMLButtonElement>}
        className={classes}
        {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  },
);
