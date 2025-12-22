import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function App({ Component, pageProps }: AppProps) {
  const [isOffline, setIsOffline] = useState(false);
  const { basePath } = useRouter();

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#2E7D32" />
        <link rel="manifest" href={`${basePath || ''}/manifest.json`} />
        <link rel="apple-touch-icon" href={`${basePath || ''}/icons/icon-192x192.png`} />
        <title>KisanBuddy | किसान मित्र</title>
      </Head>
      {isOffline && (
        <div className="offline-banner">
          📴 ऑफलाइन मोड | Offline Mode – Data will sync when connected
        </div>
      )}
      <Component {...pageProps} />
    </>
  );
}
