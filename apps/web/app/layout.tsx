import type { ReactNode } from "react";
import { Footer } from "./components/Footer";
import { Topbar } from "./components/Topbar";
import { Tabs } from "./components/Tabs";

export const metadata = {
  title: "ArbiTrack",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* @ts-expect-error Async Server Component */}
        <Topbar />
        <Tabs />
        {children}
        <Footer />
      </body>
    </html>
  );
}
