"use client";

import { useState } from "react";
import { UpdatedAgo } from "../../components/UpdatedAgo";

export default function Page() {
  const [since, setSince] = useState(() => Date.now());
  return (
    <main>
      <UpdatedAgo since={since} />
      <button data-testid="poll" onClick={() => setSince(Date.now())}>
        poll
      </button>
    </main>
  );
}
