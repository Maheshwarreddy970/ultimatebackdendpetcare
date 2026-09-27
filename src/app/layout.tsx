import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // Make sure this points to your CSS file
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pet Care Leads Admin",
  description: "Internal Dashboard for Pet Care Leads",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning prevents errors caused by browser extensions injecting code
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen flex flex-col bg-gray-50`} suppressHydrationWarning>
        
        {/* GLOBAL NAVIGATION BAR */}
        <nav className="w-full bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <span className="text-xl font-extrabold text-indigo-600">AdminPanel</span>
                <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                  <Link 
                    href="/navcheck" 
                    className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
                  >
                    Logo Review Dashboard
                  </Link>
                  <Link 
                    href="/pushdata" 
                    className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
                  >
                    Data Uploader
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* PAGE CONTENT */}
        <div className="flex-1">
          {children}
        </div>

      </body>
    </html>
  );
}