import React from 'react';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TVProvider } from "@/lib/contexts/TVContext";
import { TVNavigationInitializer } from "@/components/TVNavigationInitializer";
import { Analytics } from "@vercel/analytics/react";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { PasswordGate } from "@/components/PasswordGate";
import { siteConfig } from "@/lib/config/site-config";
import { AdKeywordsInjector } from "@/components/AdKeywordsInjector";
import { BackToTop } from "@/components/ui/BackToTop";
import { ScrollPositionManager } from "@/components/ScrollPositionManager";
import fs from 'fs';
import path from 'path';

// Server Component specifically for reading env/file (async for best practices)
async function AdKeywordsWrapper() {
  let keywords: string[] = [];

  try {
    // 1. Try reading from file (Docker runtime support)
    const keywordsFile = process.env.AD_KEYWORDS_FILE;
    if (keywordsFile) {
      // Resolve absolute path or relative to CWD
      const filePath = path.isAbsolute(keywordsFile)
        ? keywordsFile
        : path.join(process.cwd(), keywordsFile);

      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        keywords = content.split(/[\n,]/).map((k: string) => k.trim()).filter((k: string) => k);
        console.log(`[AdFilter] Loaded ${keywords.length} keywords from file: ${filePath}`);
      } catch (fileError: unknown) {
        // Handle file not found (ENOENT) gracefully
        if ((fileError as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn('[AdFilter] Error reading keywords file:', fileError);
        }
      }
    }

    // 2. Fallback to Env var (Runtime or Build time)
    if (keywords.length === 0) {
      const envKeywords = process.env.AD_KEYWORDS || process.env.NEXT_PUBLIC_AD_KEYWORDS;
      if (envKeywords) {
        keywords = envKeywords.split(/[\n,]/).map((k: string) => k.trim()).filter((k: string) => k);
      }
    }
  } catch (error) {
    console.warn('[AdFilter] Failed to load keywords:', error);
  }

  return <AdKeywordsInjector keywords={keywords} />;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
  icons: {
    icon: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        {/* Apple PWA Support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="KVideo" />
        <link rel="apple-touch-icon" href="/icon.png" />
        {/* Theme Color (for browser address bar) */}
        <meta name="theme-color" content="#000000" />
        {/* Mobile viewport */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <TVProvider>
            <TVNavigationInitializer />
            <PasswordGate hasAuth={!!(process.env.ADMIN_PASSWORD || process.env.ACCOUNTS || process.env.ACCESS_PASSWORD)}>
              <AdKeywordsWrapper />
              {children}
              <BackToTop />
              <ScrollPositionManager />
            </PasswordGate>
          </TVProvider>
          <Analytics />
          <ServiceWorkerRegister />
        </ThemeProvider>

        {/* ARIA Live Region for Screen Reader Announcements */}
        <div
          id="aria-live-announcer"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />

        {/* Google Cast SDK */}
        <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1" async />

        {/* Scroll Performance Optimization Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                let scrollTimer;
                const body = document.body;
                
                function handleScroll() {
                  body.classList.add('scrolling');
                  clearTimeout(scrollTimer);
                  scrollTimer = setTimeout(function() {
                    body.classList.remove('scrolling');
                  }, 150);
                }
                
                let ticking = false;
                window.addEventListener('scroll', function() {
                  if (!ticking) {
                    window.requestAnimationFrame(function() {
                      handleScroll();
                      ticking = false;
                    });
                    ticking = true;
                  }
                }, { passive: true });
              })();
            `,
          }}
        />
        
        {/* ================= 終極繁簡轉換 (底層網路與路由攔截) ================= */}
        <script src="https://fastly.jsdelivr.net/npm/chinese-s2t@1.0.0/dist/chinese-s2t.js" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            function initS2T() {
              if (typeof ChineseS2T === 'undefined') {
                setTimeout(initS2T, 100);
                return;
              }

              // 安全轉換網址編碼的函數
              function convertUrl(url) {
                if (!url || typeof url !== 'string') return url;
                try {
                  let decoded = decodeURI(url);
                  let simplified = ChineseS2T.t2s(decoded);
                  return encodeURI(simplified);
                } catch(e) {
                  return url;
                }
              }

              // 1. 攔截底層 Fetch 請求 (解決 API 搜尋)
              const originalFetch = window.fetch;
              window.fetch = async function(...args) {
                if (typeof args[0] === 'string') {
                  args[0] = convertUrl(args[0]);
                }
                return originalFetch.apply(this, args);
              };

              // 2. 攔截舊版 XMLHttpRequest
              const originalOpen = XMLHttpRequest.prototype.open;
              XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                if (typeof url === 'string') {
                  url = convertUrl(url);
                }
                return originalOpen.call(this, method, url, ...rest);
              };

              // 3. 攔截 Next.js 前端路由跳轉 (解決網址列變化)
              const originalPushState = history.pushState;
              history.pushState = function(state, unused, url) {
                if (typeof url === 'string') {
                  url = convertUrl(url);
                }
                return originalPushState.call(this, state, unused, url);
              };

              const originalReplaceState = history.replaceState;
              history.replaceState = function(state, unused, url) {
                if (typeof url === 'string') {
                  url = convertUrl(url);
                }
                return originalReplaceState.call(this, state, unused, url);
              };

              console.log("🚀 [KVideo] 終極全局繁簡轉換 (底層攔截) 已啟動！");
            }
            
            initS2T();
          })();
        ` }} />
      </body>
    </html>
  );
}
