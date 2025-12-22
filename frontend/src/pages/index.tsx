import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { TapButton } from '@/components/TapButton';
import { VoiceButton } from '@/components/VoiceButton';
import { SyncBadge } from '@/components/SyncBadge';
import { DiagnosticModal } from '@/components/DiagnosticModal';
import { MarketModal } from '@/components/MarketModal';
import { WeatherModal } from '@/components/WeatherModal';
import { Badge, Card } from '@/components/ui';

export default function Home() {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const router = useRouter();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'offline'>('synced');
  const [isOnline, setIsOnline] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Set greeting based on time of day
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setSyncStatus('synced'); };
    const handleOffline = () => { setIsOnline(false); setSyncStatus('offline'); };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleVoiceResult = (transcript: string) => {
    console.log('Voice input:', transcript);
    const lower = transcript.toLowerCase();
    if (lower.includes('crop') || lower.includes('फसल') || lower.includes('leaf')) {
      router.push('/diagnostic');
    } else if (lower.includes('price') || lower.includes('market') || lower.includes('मंडी')) {
      setActiveModal('market');
    } else if (lower.includes('weather') || lower.includes('मौसम') || lower.includes('rain')) {
      router.push('/weather');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Desktop Header / Navbar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-sm border-b border-neutral-100 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-elite-700 to-primary-600 flex items-center justify-center shadow-xl">
                <span className="text-2xl">🌾</span>
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-neutral-900 tracking-tight">Kisan Mitra</h1>
                <p className="text-xs text-neutral-500">किसान मित्र — Agricultural intelligence</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-3">
              <button onClick={() => router.push('/diagnostic')} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 hover:bg-primary-50 rounded-lg transition">
                Crop Health
              </button>
              <button onClick={() => setActiveModal('market')} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 hover:bg-emerald-50 rounded-lg transition">
                Market Prices
              </button>
              <button onClick={() => router.push('/weather')} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 hover:bg-amber-50 rounded-lg transition">
                Weather
              </button>
            </nav>

            {/* Right side actions */}
            <div className="flex items-center gap-4">
              <SyncBadge status={syncStatus} size="md" />
              <div className="hidden lg:flex items-center gap-3">
                <VoiceButton onResult={handleVoiceResult} onListeningChange={setIsListening} size="sm" />
                {isListening && <span className="text-xs font-medium text-red-600 animate-pulse">Listening...</span>}
              </div>
              <button onClick={() => router.push('/chat')} className="px-4 py-2 rounded-xl bg-white border border-neutral-100 shadow-sm hover:shadow-md text-sm">Chat</button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-8 py-12">
        {/* Hero: Desktop-first 12-column layout */}
        <section className="mb-10">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-7">
              <div className="rounded-3xl p-10 bg-white glass card-hover shadow-xl animate-fade-in-up">
                <div className="flex items-start gap-6">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-600 to-primary-500 flex items-center justify-center shadow-2xl">
                    <span className="text-3xl">🌿</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-4xl font-extrabold text-neutral-900 mb-2">{greeting}, Farmer.</h2>
                    <p className="text-lg text-neutral-600 mb-4">High‑quality crop diagnostics, mandi insights, and weather risk — all in one place.</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => router.push('/diagnostic')} className="btn btn-primary btn-lg">Scan a Leaf</button>
                      <button onClick={() => router.push('/market')} className="btn btn-secondary btn-lg">View Mandi Prices</button>
                    </div>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-4">
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                    <div className="text-sm text-neutral-500">Active Alerts</div>
                    <div className="text-2xl font-bold">3</div>
                  </div>
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                    <div className="text-sm text-neutral-500">Market Price (Wheat/q)</div>
                    <div className="text-2xl font-bold">₹2,450</div>
                  </div>
                  <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                    <div className="text-sm text-neutral-500">Today</div>
                    <div className="text-2xl font-bold">24°C</div>
                  </div>
                </div>
              </div>
            </div>
            <aside className="col-span-5">
              <div className="rounded-3xl p-6 bg-gradient-to-br from-neutral-50 to-neutral-0 border border-neutral-100 shadow-lg animate-fade-in-up">
                <h4 className="text-lg font-semibold text-neutral-900 mb-3">Quick Actions</h4>
                <div className="grid grid-cols-1 gap-3">
                  <button onClick={() => router.push('/diagnostic')} className="w-full btn btn-primary">Start Diagnosis</button>
                  <button onClick={() => setActiveModal('market')} className="w-full btn btn-secondary">Nearby Mandi Prices</button>
                  <button onClick={() => router.push('/weather')} className="w-full btn btn-ghost">Weather Risks</button>
                </div>
                <div className="mt-6">
                  <h5 className="text-sm font-semibold text-neutral-800 mb-2">Sync Status</h5>
                  <SyncBadge status={syncStatus} size="md" />
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* Offline Notice - Desktop */}
        {!isOnline && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-800">You&apos;re currently offline</h4>
              <p className="text-sm text-amber-700">Some features may be limited. Your data will sync when you&apos;re back online.</p>
            </div>
          </div>
        )}

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Primary Feature Cards */}
          <Card 
            className="group cursor-pointer hover:shadow-xl hover:border-primary-200 transition-all duration-300" 
            onClick={() => router.push('/diagnostic')}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <span className="text-3xl">🌿</span>
                </div>
                <Badge variant="primary" size="sm">AI Powered</Badge>
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-1">Crop Health Check</h3>
              <p className="text-sm text-neutral-500 mb-1">फसल स्वास्थ्य जांच</p>
              <p className="text-sm text-neutral-400 mt-3">
                Upload a leaf photo to instantly diagnose diseases and get treatment recommendations.
              </p>
              <div className="mt-4 flex items-center text-primary-600 text-sm font-medium group-hover:gap-2 transition-all">
                <span>Start Diagnosis</span>
                <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Card>

          <Card 
            className="group cursor-pointer hover:shadow-xl hover:border-emerald-200 transition-all duration-300" 
            onClick={() => router.push('/market')}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <span className="text-3xl">💰</span>
                </div>
                <Badge variant="success" size="sm">Live Data</Badge>
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-1">Market Prices</h3>
              <p className="text-sm text-neutral-500 mb-1">मंडी भाव</p>
              <p className="text-sm text-neutral-400 mt-3">
                Check current mandi prices across India with 14-day ARIMA-based price forecasts.
              </p>
              <div className="mt-4 flex items-center text-emerald-600 text-sm font-medium group-hover:gap-2 transition-all">
                <span>View Prices</span>
                <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Card>

          <Card 
            className="group cursor-pointer hover:shadow-xl hover:border-amber-200 transition-all duration-300" 
            onClick={() => router.push('/weather')}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <span className="text-3xl">🌧️</span>
                </div>
                <Badge variant="warning" size="sm">Earth Engine</Badge>
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-1">Weather Hazards</h3>
              <p className="text-sm text-neutral-500 mb-1">मौसम चेतावनी</p>
              <p className="text-sm text-neutral-400 mt-3">
                Get 14-day flood, drought, and extreme weather risk assessments for your location.
              </p>
              <div className="mt-4 flex items-center text-amber-600 text-sm font-medium group-hover:gap-2 transition-all">
                <span>Check Risks</span>
                <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Card>
        </div>

        {/* Secondary Features Grid */}
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-neutral-800 mb-4">More Tools</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { icon: '🌱', label: 'My Fields', labelHi: 'मेरे खेत', path: '/my-fields' },
              { icon: '🌾', label: 'My Farm', labelHi: 'मेरा खेत', path: '/my-farm' },
              { icon: '💊', label: 'Pesticides', labelHi: 'कीटनाशक', path: '/pesticides' },
              { icon: '🪲', label: 'Insecticides', labelHi: 'कीट नाशक', path: '/insecticides' },
              { icon: '🧪', label: 'Soil Test', labelHi: 'मिट्टी परीक्षण', path: '/soil-test' },
              { icon: '📊', label: 'Analytics', labelHi: 'विश्लेषण', path: '/analytics' },
              { icon: '🏺', label: 'Saved', labelHi: 'सहेजे गए', path: '/saved' },
              { icon: '📞', label: 'Help', labelHi: 'सहायता', path: '/help' },
            ].map((item, idx) => (
              <Card 
                key={idx}
                onClick={() => router.push(item.path)}
                className="group cursor-pointer hover:shadow-lg hover:border-primary-200 transition-all duration-200 text-center"
              >
                <div className="p-4">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-neutral-100 flex items-center justify-center group-hover:bg-primary-100 group-hover:scale-110 transition-all duration-200 mb-3">
                    <span className="text-2xl">{item.icon}</span>
                  </div>
                  <h4 className="font-semibold text-neutral-800 text-sm">{item.label}</h4>
                  <p className="text-xs text-neutral-400">{item.labelHi}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Quick Info Cards Row */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <span className="text-2xl">📍</span>
              </div>
              <div>
                <h4 className="font-semibold text-blue-900">Location Services</h4>
                <p className="text-sm text-blue-700">Enable for weather data</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <span className="text-2xl">🗣️</span>
              </div>
              <div>
                <h4 className="font-semibold text-purple-900">Voice Commands</h4>
                <p className="text-sm text-purple-700">Speak in Hindi or English</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <span className="text-2xl">🔒</span>
              </div>
              <div>
                <h4 className="font-semibold text-green-900">Offline Ready</h4>
                <p className="text-sm text-green-700">Works without internet</p>
              </div>
            </div>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌾</span>
              <div>
                <p className="font-semibold text-neutral-800">Kisan Mitra</p>
                <p className="text-xs text-neutral-500">Empowering Indian Farmers with AI</p>
              </div>
            </div>
            <p className="text-sm text-neutral-400">
              Data sources: Agmarknet, CEDA Ashoka, Google Earth Engine, CIB&RC
            </p>
          </div>
        </div>
      </footer>

      {/* Legacy modal renders removed — navigation uses dedicated pages now */}
    </div>
  );
}
