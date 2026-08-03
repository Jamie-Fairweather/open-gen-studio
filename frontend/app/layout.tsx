import { Geist_Mono, Outfit } from "next/font/google"

import "./globals.css"
import { NativeChrome } from "@/components/native-chrome"
import { StartupOverlay } from "@/components/startup-overlay"
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" })
const outfitHeading = Outfit({ subsets: ["latin"], variable: "--font-heading" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark antialiased",
        outfit.variable,
        outfitHeading.variable,
        geistMono.variable
      )}
    >
      <body className="font-sans">
        <NativeChrome />
        <TooltipProvider>
          <ToastProvider position="bottom-right">
            <AnchoredToastProvider>{children}</AnchoredToastProvider>
          </ToastProvider>
        </TooltipProvider>
        <StartupOverlay />
      </body>
    </html>
  )
}
