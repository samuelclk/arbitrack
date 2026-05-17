import type { OpportunityDTO } from "../lib/useOpportunities";

const bpsToPct = (bps: string | null): string =>
  bps == null ? "—" : `${(Number(bps) / 100).toFixed(2)}%`;

export function OpportunityRow({ opp }: { opp: OpportunityDTO }) {
  return (
    <tr data-testid="opportunity-row">
      <td>{opp.pair}</td>
      <td>{opp.long_venue ?? "—"}</td>
      <td>{opp.short_venue ?? "—"}</td>
      <td>{opp.chain ?? "—"}</td>
      <td>{bpsToPct(opp.spread_bps)}</td>
      <td>{bpsToPct(opp.apr_bps)}</td>
    </tr>
  );
}
