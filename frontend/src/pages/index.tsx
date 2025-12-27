import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Badge, Card } from '@/components/ui';
import useCountUp from '@/lib/useCountUp';
import { useI18n, LANGUAGE_NAMES } from '@/lib/i18n';
import ReactMarkdown from 'react-markdown';
import { getApiUrl } from '@/lib/api';

function CentralChat() {
  const [chatHistory, setChatHistory] = useState<{role:'user'|'assistant';content:string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const _prevChatLen = useRef(0);
  useEffect(() => {
    if (chatHistory.length > _prevChatLen.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    _prevChatLen.current = chatHistory.length;
  }, [chatHistory]);

  const send = async () => {
    if (!input.trim()) return;
    const message = input.trim();
    setChatHistory(prev => [...prev, {role:'user', content: message}]);
    setInput('');
    setLoading(true);
    try {
      const apiBase = getApiUrl();
      const res = await fetch(`${apiBase}/api/agents/central`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ message }) });
      if (!res.ok) throw new Error('Server '+res.status);
      const data = await res.json();
      const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      setChatHistory(prev => [...prev, {role:'assistant', content}]);
    } catch (e:any) {
      setChatHistory(prev => [...prev, {role:'assistant', content: 'Error: '+(e?.message||String(e))}]);
    } finally { setLoading(false); }
  };

  return (
    <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200">
      <div className="text-sm text-neutral-600 mb-2">Ask the centralized agent</div>
      <div className="h-40 overflow-auto mb-2 space-y-2">
        {chatHistory.map((m, i) => (
          <div key={i} className={m.role==='user'? 'text-right':'text-left'}>
            <div className={`inline-block p-2 rounded ${m.role==='user' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>
              {m.role==='assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : <div>{m.content}</div>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyPress={(e)=>e.key==='Enter'&&send()} className="flex-1 px-3 py-2 border rounded" placeholder="Ask: How to treat powdery mildew?" />
        <button onClick={send} className="px-4 py-2 bg-indigo-600 text-white rounded" disabled={loading}>Ask</button>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { lang, setLang, t, available } = useI18n();
  const [isOnline, setIsOnline] = useState(true);
  const [greeting, setGreeting] = useState('');

  // Set greeting based on time of day
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const features = [
    {
      icon: '🌿',
      title: 'Crop Health Check',
      subtitle: 'फसल स्वास्थ्य जांच',
      description: 'AI-powered disease diagnosis with instant treatment recommendations',
      badge: 'AI Powered',
      badgeVariant: 'primary' as const,
      href: '/diagnostic',
      color: 'from-green-100 to-emerald-50',
      hoverColor: 'hover:border-green-200',
      textColor: 'text-green-600'
    },
    {
      icon: '💰',
      title: 'Market Prices',
      subtitle: 'मंडी भाव',
      description: 'Live mandi prices with distance-adjusted effective pricing',
      badge: 'Live Data',
      badgeVariant: 'success' as const,
      href: '/market',
      color: 'from-emerald-100 to-teal-50',
      hoverColor: 'hover:border-emerald-200',
      textColor: 'text-emerald-600'
    },
    {
      icon: '🌧️',
      title: 'Weather & Alerts',
      subtitle: 'मौसम चेतावनी',
      description: 'Impact-based weather forecasts with hazard warnings',
      badge: 'IBF System',
      badgeVariant: 'warning' as const,
      href: '/weather',
      color: 'from-amber-100 to-orange-50',
      hoverColor: 'hover:border-amber-200',
      textColor: 'text-amber-600'
    },
    {
      icon: '🧪',
      title: 'Soil Report Advisor',
      subtitle: 'मिट्टी रिपोर्ट सलाहकार',
      description: 'Upload lab reports, get AI crop recommendations via chat',
      badge: 'OCR + Chat',
      badgeVariant: 'primary' as const,
      href: '/soil-report',
      color: 'from-indigo-100 to-purple-50',
      hoverColor: 'hover:border-indigo-200',
      textColor: 'text-indigo-700'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/images/hero.svg')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600/40 to-emerald-600/40" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center text-white">
            {/* Logo */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-sm shadow-2xl mb-6">
              <span className="text-4xl">🌾</span>
            </div>
            
            {/* Main Heading */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
              {t('siteTitle')}
            </h1>
            <p className="text-xl sm:text-2xl font-medium text-green-100 mb-2">
              {t('siteSubtitle')}
            </p>
            <p className="text-base sm:text-lg text-white/90 max-w-2xl mx-auto mb-8">
              {greeting}, Farmer. AI-powered agricultural intelligence for Indian farmers — 
              crop diagnostics, market insights, and weather risk analysis
            </p>
            <div className="absolute right-6 top-6 z-30">
              <select value={lang} onChange={(e)=>setLang(e.target.value as any)} className="px-2 py-1 rounded bg-white/90 text-sm text-neutral-900 shadow-sm z-40">
                {available.map(l => <option key={l} value={l}>{LANGUAGE_NAMES[l] ?? l.toUpperCase()}</option>)}
              </select>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
              <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">{useCountUp(50, 800)}+</div>
                <div className="text-sm text-green-100">Diseases Detected</div>
              </div>
              <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">₹{useCountUp(2450, 1000)}</div>
                <div className="text-sm text-green-100">Wheat Price/q</div>
              </div>
              <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
                <div className="text-3xl font-bold mb-1">{useCountUp(24, 800)}°C</div>
                <div className="text-sm text-green-100">Current Temp</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Offline Notice */}
      {!isOnline && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 -mt-6 relative z-10">
          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl flex items-start gap-3 shadow-lg">
            <span className="text-2xl">⚠️</span>
            <div>
              <h4 className="font-semibold text-amber-900 mb-1">You&apos;re currently offline</h4>
              <p className="text-sm text-amber-700">Some features may be limited. Data will sync when you&apos;re back online.</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        
        {/* Features Grid */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-neutral-900 mb-2">
              Powerful Tools for Smart Farming
            </h2>
            <p className="text-neutral-600">
              Everything you need to make informed decisions for your farm
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, idx) => (
              <Card
                key={idx}
                variant="elevated"
                className={`group cursor-pointer hover:shadow-2xl ${feature.hoverColor} transition-all duration-300 transform hover:scale-105 bg-white/90 backdrop-blur-sm`}
                onClick={() => router.push(feature.href)}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300`}>
                      <span className="text-4xl">{feature.icon}</span>
                    </div>
                    <Badge variant={feature.badgeVariant} size="sm">
                      {feature.badge}
                    </Badge>
                  </div>
                  
                  <h3 className="text-lg font-bold text-neutral-900 mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-neutral-500 mb-3">
                    {feature.subtitle}
                  </p>
                  <p className="text-sm text-neutral-600 leading-relaxed mb-4">
                    {feature.description}
                  </p>
                  
                  <div className={`flex items-center ${feature.textColor} text-sm font-medium group-hover:gap-2 transition-all`}>
                    <span>Explore</span>
                    <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card variant="elevated" className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">📱</span>
                <h3 className="text-lg font-bold text-neutral-900">Mobile Friendly</h3>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Access all features on your smartphone with an intuitive, touch-optimized interface
              </p>
            </div>
          </Card>

          <Card variant="elevated" className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🌐</span>
                <h3 className="text-lg font-bold text-neutral-900">Offline Support</h3>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Critical features work offline and sync automatically when you&apos;re back online
              </p>
            </div>
          </Card>

          <Card variant="elevated" className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🇮🇳</span>
                <h3 className="text-lg font-bold text-neutral-900">India-Focused</h3>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Built specifically for Indian agriculture with regional language support
              </p>
            </div>
          </Card>
        </div>

        {/* How It Helps */}
        <Card variant="elevated" className="bg-white/90 backdrop-blur-sm">
          <div className="p-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-6 text-center">
              How {t('siteTitle')} Helps You
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Prevent Crop Losses</h3>
                  <p className="text-sm text-neutral-600">
                    Early disease detection with AI helps you take action before it spreads, saving your harvest
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Maximize Profits</h3>
                  <p className="text-sm text-neutral-600">
                    Get the best market prices with distance-adjusted effective pricing for better selling decisions
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Reduce Weather Risks</h3>
                  <p className="text-sm text-neutral-600">
                    Impact-based weather alerts help you protect crops from floods, droughts, and extreme weather
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Improve Soil Health</h3>
                  <p className="text-sm text-neutral-600">
                    Data-driven soil analysis ensures optimal nutrient levels for healthy, high-yield crops
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Central Agent Chat */}
        <div className="mt-8">
          <CentralChat />
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🌾</span>
              <div>
                <p className="font-bold text-neutral-900">{t('siteTitle')}</p>
                <p className="text-xs text-neutral-500">Empowering Indian Farmers with AI</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-neutral-600">
              <button onClick={() => router.push('/diagnostic')} className="hover:text-neutral-900 transition">
                Crop Health
              </button>
              <button onClick={() => router.push('/market')} className="hover:text-neutral-900 transition">
                Markets
              </button>
              <button onClick={() => router.push('/weather')} className="hover:text-neutral-900 transition">
                Weather
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
