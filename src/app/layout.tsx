import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/providers/AuthProvider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

// Render every page per request so Next.js never marks HTML as cacheable by a
// shared cache (it otherwise sends `s-maxage=31536000` for prerendered pages).
// The middleware can attach session cookies to any page response, and a cached
// copy would hand one visitor's session to the next.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reimbursement Dashboard",
  description: "A dashboard for managing reimbursements",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
