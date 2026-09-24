import { redirect } from "next/navigation";

type Search = Promise<{
  type?: string;
  source?: string;
  q?: string;
  actionable?: string;
  provider?: string;
}>;

export default async function SourcesPage({ searchParams }: { searchParams: Search }) {
  const filters = await searchParams;
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.type) query.set("type", filters.type);
  if (filters.provider) query.set("provider", filters.provider);

  const qs = query.toString();
  redirect(`/leads${qs ? `?${qs}` : ""}`);
}
