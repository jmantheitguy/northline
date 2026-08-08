import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northline — Creative work, clearly organized",
  description: "A self-hosted, Discord-ready project workspace for your community.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
