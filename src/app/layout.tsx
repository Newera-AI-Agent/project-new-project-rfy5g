import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://newera-pdfeditz.pages.dev"),
  title: "PdfEditz — Client-Side PDF Editor",
  description:
    "A 100% client-side, mobile-first PDF editor. Edit, annotate, merge, split, sign, redact, compress and export PDFs without your files ever leaving the browser.",
  applicationName: "PdfEditz",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "PdfEditz" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png" }],
  },
  openGraph: {
    title: "PdfEditz — Client-Side PDF Editor",
    description: "Edit PDFs entirely in your browser. No uploads, no servers, 100% private.",
    images: ["/og-image.png"],
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('pdfeditz-theme')||'light';document.documentElement.classList.add('theme-'+t);}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}