import Link from "next/link";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/peg", label: "Peg" },
  { href: "/pendle", label: "Pendle" },
  { href: "/funding", label: "Funding" },
  { href: "/basis", label: "Basis" },
  { href: "/lend", label: "Lend" },
  { href: "/loops", label: "Loops" },
];

export function Tabs() {
  return (
    <nav
      data-testid="tabs"
      style={{
        display: "flex",
        gap: "1rem",
        padding: "0.75rem 1rem",
        borderBottom: "1px solid #ccc",
      }}
    >
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} data-testid={`tab-${t.label.toLowerCase()}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
