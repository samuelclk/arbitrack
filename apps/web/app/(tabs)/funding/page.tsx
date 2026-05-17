"use client";

import { useOpportunities } from "../../lib/useOpportunities";
import { OpportunityRow } from "../../components/OpportunityRow";
import { UpdatedAgo } from "../../components/UpdatedAgo";

export default function FundingPage() {
  const { rows, isLoading, error } = useOpportunities("funding");
  const since =
    rows.length > 0
      ? Math.max(...rows.map((r) => new Date(r.computed_at).getTime()))
      : Date.now();

  return (
    <main>
      <h1>Funding</h1>
      <UpdatedAgo since={since} />
      {error ? <p>Failed to load.</p> : null}
      {isLoading && rows.length === 0 ? <p>Loading…</p> : null}
      <table>
        <thead>
          <tr>
            <th>pair</th>
            <th>long</th>
            <th>short</th>
            <th>chain</th>
            <th>spread</th>
            <th>APR</th>
            <th>24h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <OpportunityRow key={r.id} opp={r} />
          ))}
        </tbody>
      </table>
    </main>
  );
}
