import type { ReactNode } from "react";
import { Footer } from "./components/Footer";
import { Topbar } from "./components/Topbar";

export const metadata = {
  title: "ArbiTrack",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* @ts-expect-error Async Server Component */}
        <Topbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
