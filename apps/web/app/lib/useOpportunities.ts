"use client";

import useSWR from "swr";

export interface OpportunityDTO {
  id: number;
  category: string;
  pair: string;
  long_venue: string | null;
  short_venue: string | null;
  chain: string | null;
  spread_bps: string | null;
  apr_bps: string;
  detail: Record<string, unknown>;
  computed_at: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useOpportunities(category: string) {
  const { data, error, isLoading } = useSWR<OpportunityDTO[]>(
    `/api/opportunities?cat=${encodeURIComponent(category)}`,
    fetcher,
    { refreshInterval: 10_000 },
  );
  return { rows: data ?? [], error, isLoading };
}
