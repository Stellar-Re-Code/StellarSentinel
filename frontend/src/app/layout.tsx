import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StellarSentinel — Decentralized Treasury Management",
  description:
    "Multi-signature treasury and DAO governance platform built on Stellar Soroban. Manage shared funds with configurable approval thresholds, proposal voting, and on-chain transparency.",
  keywords: [
    "Stellar",
    "Soroban",
    "DAO",
    "Treasury",
    "Multi-sig",
    "Governance",
    "DeFi",
    "Smart Contracts",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-stellar-darker">
        {/* TODO: [FE-2] Wrap with FreighterProvider */}
        <nav className="border-b border-stellar-border bg-stellar-dark/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <div className="flex items-center space-x-3">
                <span className="text-2xl font-bold gradient-text">
                  🛡️ StellarSentinel
                </span>
              </div>
              <div className="hidden md:flex items-center space-x-8">
                <a
                  href="/"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Dashboard
                </a>
                <a
                  href="/treasury"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Treasury
                </a>
                <a
                  href="/governance"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Governance
                </a>
              </div>
              {/* TODO: [FE-3] Add WalletConnect button here */}
              <div className="btn-secondary text-sm">Connect Wallet</div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
