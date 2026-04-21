"use client";

export function StaticPage({
  title,
  eyebrow,
  body,
}: {
  title: string;
  eyebrow?: string;
  body: string;
}) {
  return (
    <div className="page-shell page-stack">
      <section className="content-hero">
        <span className="section-eyebrow">{eyebrow ?? "SMURFX"}</span>
        <h1>{title}</h1>
      </section>
      <section
        className="content-prose"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}
