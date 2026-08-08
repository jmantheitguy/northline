import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://northline.vtuberoffices.com"),
  title: "Northline — Creative work, clearly organized",
  description: "A private, self-hosted project workspace for boards, collaboration, administration, and Discord reminders.",
  applicationName: "Northline",
  openGraph: { title: "Northline", description: "Creative work, clearly organized.", type: "website" },
  twitter: { card: "summary_large_image", title: "Northline", description: "Creative work, clearly organized." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
