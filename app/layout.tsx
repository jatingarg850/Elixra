import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import DndWrapper from '@/components/DndWrapper'
import Providers from '@/components/Providers'
import ConditionalFooter from '@/components/ConditionalFooter'
import PageLoader from '@/components/PageLoader'
import TopLoadingBar from '@/components/TopLoadingBar'
import GrainOverlay from '@/components/GrainOverlay'

export const metadata = {
  title: 'Elixra - Virtual Chem Lab',
  description: 'Interactive virtual chemistry lab for qualitative inorganic salt analysis',
  manifest: '/manifest.json',
  icons: {
    icon: '/Assets/Link logo.svg',
    shortcut: '/Assets/Link logo.svg',
    apple: '/Assets/Link logo.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Elixra',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen overflow-x-hidden font-sans">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              console.clear();
              console.log('%cHey dev', 'color: #00ff00; font-size: 20px; font-weight: bold;');
              console.log = function() {};
              console.warn = function() {};
              console.error = function() {};
              console.info = function() {};
              console.debug = function() {};
            `
          }}
        />
        <Providers>
          <ThemeProvider>
            <DndWrapper>
              <PageLoader>
                <TopLoadingBar />
                <main className="flex-1">
                  {children}
                </main>
                <ConditionalFooter />
              </PageLoader>
            </DndWrapper>
          </ThemeProvider>
        </Providers>
        <GrainOverlay />
      </body>
    </html>
  )
}
