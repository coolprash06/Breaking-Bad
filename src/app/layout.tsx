import type { Metadata } from "next";
import { Bebas_Neue, Inter, JetBrains_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const bebas = Bebas_Neue({ variable: "--font-bebas", weight: "400", subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  weight: ["400", "600"],
  subsets: ["devanagari"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WellCast: water early warning for Thar & Kutch",
  description:
    "A weather forecast for wells: AI early warning that forecasts when desert water sources will fail and warns the people who depend on them.",
};

/** Applies a saved theme before first paint. No saved choice = follow the system setting. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("wellcast-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bebas.variable} ${jetbrains.variable} ${inter.variable} ${devanagari.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
