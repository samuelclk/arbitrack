"use client";

import useSWR from "swr";
import type { OpportunityDTO } from "../lib/useOpportunities";
import { Sparkline } from "./Sparkline";

const bpsToPct = (bps: string | null): string =>
  bps == null ? "—" : `${(Number(bps) / 100).toFixed(2)}%`;

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json()) as Promise<Array<{ spread_bps_avg: string }>>;

export function OpportunityRow({ opp }: { opp: OpportunityDTO }) {
  const { data } = useSWR(
    `/api/sparkline/${encodeURIComponent(opp.category)}/${encodeURIComponent(opp.pair)}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const points = (data ?? []).map((r) => Number(r.spread_bps_avg));
  return (
    <tr data-testid="opportunity-row">
      <td>{opp.pair}</td>
      <td>{opp.long_venue ?? "—"}</td>
      <td>{opp.short_venue ?? "—"}</td>
      <td>{opp.chain ?? "—"}</td>
      <td>{bpsToPct(opp.spread_bps)}</td>
      <td>{bpsToPct(opp.apr_bps)}</td>
      <td><Sparkline points={points} /></td>
    </tr>
  );
}
