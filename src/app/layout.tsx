import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import KillBanner from "@/components/KillBanner";

const heading = Bricolage_Grotesque({ variable: "--font-heading", subsets: ["latin"] });
const body = DM_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Freshroots Stock Planner",
  description: "Weekly reorder and pause recommendations for Freshroots, reviewed and approved by the demand planner.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <Header />
        <KillBanner />
        {children}
      </body>
    </html>
  );
}
