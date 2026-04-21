import { getJobs } from "@/lib/catalog";
import { JobsPage } from "@/components/store/jobs-page";

export default async function EmpleoPage() {
  const jobs = await getJobs();
  return <JobsPage jobs={jobs} />;
}
