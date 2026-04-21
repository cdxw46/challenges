"use client";

import { ArrowRight, BriefcaseBusiness, MapPin } from "lucide-react";

type JobsPageProps = {
  jobs: Array<{
    id: string;
    title: string;
    team: string;
    location: string;
    modality: string;
    description: string;
    requirements: string;
  }>;
};

export function JobsPage({ jobs }: JobsPageProps) {
  return (
    <div className="page-shell page-stack">
      <section className="listing-hero">
        <div>
          <span className="section-eyebrow">Careers</span>
          <h1>Construye el siguiente flagship digital de SMURFX.</h1>
          <p>
            Buscamos perfiles que entiendan producto, sistemas, operaciones y experiencia premium
            de compra.
          </p>
        </div>
      </section>

      <section className="product-grid">
        {jobs.map((job) => (
          <article key={job.id} className="card static-page-card">
            <div className="static-page-body">
              <span className="section-eyebrow">{job.team}</span>
              <h2>{job.title}</h2>
              <div className="muted" style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <MapPin size={16} /> {job.location}
                </span>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <BriefcaseBusiness size={16} /> {job.modality}
                </span>
              </div>
              <p>{job.description}</p>
              <p className="muted">{job.requirements}</p>
              <a href={`mailto:talent@smurfx.com?subject=${encodeURIComponent(job.title)}`} className="filter-chip">
                Aplicar ahora <ArrowRight size={14} />
              </a>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
