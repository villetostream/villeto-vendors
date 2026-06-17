import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shared/Providers";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Villeto Vendor Portal",
  description: "Manage your vendor profile, orders, and invoices on Villeto.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "development" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  const origError = console.error;
                  console.error = function(...args) {
                    const msg = args[0];
                    if (typeof msg === 'string') {
                      if (msg.includes('bis_skin_checked') || msg.includes('bis_register') || msg.includes('__processed_')) {
                        return;
                      }
                      if (
                        msg.includes('Hydration failed') || 
                        msg.includes('does not match the server') || 
                        msg.includes('hydration-mismatch') ||
                        msg.includes('Text content did not match')
                      ) {
                        const argStr = JSON.stringify(args);
                        if (
                          argStr.includes('bis_skin_checked') || 
                          argStr.includes('bis_register') || 
                          argStr.includes('__processed_')
                        ) {
                          return;
                        }
                      }
                    }
                    origError.apply(console, args);
                  };
                })();
              `,
            }}
          />
        )}
      </head>
      <body className={`${geist.variable} font-sans antialiased`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
