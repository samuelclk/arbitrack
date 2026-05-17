"use client";

import { useEffect, useState } from "react";

export function UpdatedAgo({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setNow(Date.now());
  }, [since]);

  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return <span data-testid="updated-ago">Updated {seconds}s ago</span>;
}
