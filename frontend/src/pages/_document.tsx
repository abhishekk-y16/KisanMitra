import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="hi">
      <Head>
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Premium Font Stack */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Noto+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        
        {/* Meta */}
        <meta name="description" content="Kisan-Mitra: Your intelligent farming companion for crop diagnosis, market prices, and weather alerts" />
        <meta name="application-name" content="Kisan-Mitra" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kisan-Mitra" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
