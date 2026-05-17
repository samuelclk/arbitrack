import type { ReactNode } from "react";
import { Footer } from "./components/Footer";

export const metadata = {
  title: "ArbiTrack",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Footer />
      </body>
    </html>
  );
}
