import type { Metadata, Viewport } from "next";
import { Noto_Sans_Devanagari, Noto_Sans_Malayalam, Nunito } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"] });
const malayalam = Noto_Sans_Malayalam({ variable: "--font-ml", subsets: ["malayalam"], weight: ["300", "400", "500", "700"] });
const devanagari = Noto_Sans_Devanagari({ variable: "--font-dev", subsets: ["devanagari"], weight: ["300", "400", "500", "700"] });

export const metadata: Metadata = {
  title: "PharmiAI",
  description: "Medicine care assistant for families caring for elderly parents.",
  appleWebApp: { capable: true, title: "PharmiAI", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#eef9d9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${malayalam.variable} ${devanagari.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
