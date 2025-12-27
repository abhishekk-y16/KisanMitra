import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import ApiErrorToast from '@/components/ApiErrorToast';
import { I18nProvider } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n';

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

  function AppHead() {
    const { t } = useI18n();
    return (
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#2E7D32" />
        <link rel="manifest" href={`${basePath || ''}/manifest.json`} />
        <link rel="apple-touch-icon" href={`${basePath || ''}/icons/icon-192x192.png`} />
        <title>{t('siteTitle')} | {t('siteSubtitle')}</title>
      </Head>
    );
  }

  return (
    <>
      <ApiErrorToast />
      <I18nProvider>
        <AppHead />
        {isOffline && (
          <div className="offline-banner">
            📴 { /* keep bilingual */ } {"ऑफलाइन मोड | Offline Mode – Data will sync when connected"}
          </div>
        )}
        <Component {...pageProps} />
      </I18nProvider>
    </>
  );
}
