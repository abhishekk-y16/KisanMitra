import { useState } from 'react';
import { Modal } from './Modal';
import { Button, Badge, Skeleton, Alert, Card } from './ui';

interface PriceData {
  city: string;
  modal_price: number;
  min_price?: number;
  max_price?: number;
}

interface ForecastData {
  date: string;
  modal_price: number;
}

interface MarketData {
  prices?: PriceData[];
  forecast?: ForecastData[];
  trend?: 'up' | 'down' | 'stable';
  lastUpdated?: string;
}

interface MarketModalProps {
  onClose?: () => void;
  inline?: boolean;
}

const COMMON_CROPS = [
  { name: 'Wheat', hindi: 'गेहूं', icon: '🌾', color: 'bg-amber-50 hover:bg-amber-100 border-amber-200' },
  { name: 'Rice', hindi: 'चावल', icon: '🍚', color: 'bg-slate-50 hover:bg-slate-100 border-slate-200' },
  { name: 'Tomato', hindi: 'टमाटर', icon: '🍅', color: 'bg-red-50 hover:bg-red-100 border-red-200' },
  { name: 'Onion', hindi: 'प्याज', icon: '🧅', color: 'bg-purple-50 hover:bg-purple-100 border-purple-200' },
  { name: 'Potato', hindi: 'आलू', icon: '🥔', color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200' },
  { name: 'Cotton', hindi: 'कपास', icon: '☁️', color: 'bg-sky-50 hover:bg-sky-100 border-sky-200' },
];

export function MarketModal({ onClose, inline = false }: MarketModalProps) {
  const [selectedCrop, setSelectedCrop] = useState<typeof COMMON_CROPS[0] | null>(null);
  const [prices, setPrices] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = async (crop: typeof COMMON_CROPS[0]) => {
    setSelectedCrop(crop);
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agmarknet_proactive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commodity: crop.name }),
      });

      if (!res.ok) {
        // Try to read server error message
        let text = await res.text().catch(() => null);
        try {
          const json = text ? JSON.parse(text) : null;
          const detail = json?.detail || json?.message || text;
          console.error('Server error fetching prices:', detail);
          setError(detail || 'Could not fetch prices. Please try again.');
        } catch {
          console.error('Server error fetching prices:', text);
          setError(text || 'Could not fetch prices. Please try again.');
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      setPrices(data);
    } catch (err) {
      console.error('Failed to fetch prices:', err);
      setError('Could not fetch prices. Please try again.');
    }
    setLoading(false);
  };

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up':
        return <span className="text-emerald-500">↑</span>;
      case 'down':
        return <span className="text-red-500">↓</span>;
      default:
        return <span className="text-neutral-400">→</span>;
    }
  };

  const footerContent = selectedCrop ? (
    <Button 
      variant="secondary" 
      onClick={() => { setSelectedCrop(null); setPrices(null); setError(null); }}
      fullWidth
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      }
    >
      Back to Crops | वापस
    </Button>
  ) : undefined;

  const content = (
    <>
      {error && (
        <Alert variant="error" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!selectedCrop ? (
        /* Crop Selection Grid */
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            Select a crop to view current market prices and 14-day forecast
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {COMMON_CROPS.map((crop, index) => (
              <button
                key={crop.name}
                onClick={() => fetchPrices(crop)}
                className={`
                  group relative p-4 rounded-2xl border
                  ${crop.color}
                  text-center transition-all duration-200
                  hover:shadow-md hover:-translate-y-0.5
                  active:scale-[0.98]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                `}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="block text-3xl mb-2 transition-transform duration-200 group-hover:scale-110">
                  {crop.icon}
                </span>
                <span className="block font-semibold text-neutral-900">{crop.hindi}</span>
                <span className="block text-xs text-neutral-500">{crop.name}</span>
              </button>
            ))}
          </div>

          {/* Quick Info */}
          <div className="flex items-center gap-2 text-xs text-neutral-400 pt-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Data from CEDA Ashoka / Agmarknet
          </div>
        </div>
      ) : loading ? (
        /* Loading State */
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl">{selectedCrop.icon}</span>
            <div>
              <Skeleton className="h-6 w-24 mb-1" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      ) : prices ? (
        /* Results View */
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 flex items-center justify-center rounded-2xl ${selectedCrop.color.split(' ')[0]}`}>
              <span className="text-3xl">{selectedCrop.icon}</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-neutral-900">{selectedCrop.hindi}</h3>
              <p className="text-sm text-neutral-500">{selectedCrop.name} prices across India</p>
            </div>
            {prices.trend && (
              <Badge 
                variant={prices.trend === 'up' ? 'success' : prices.trend === 'down' ? 'error' : 'secondary'}
                size="md"
              >
                {getTrendIcon(prices.trend)} {prices.trend === 'up' ? 'Rising' : prices.trend === 'down' ? 'Falling' : 'Stable'}
              </Badge>
            )}
          </div>

          {/* Current Prices Table */}
          {prices.prices && prices.prices.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-neutral-100">
                <h4 className="font-semibold text-neutral-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Recent Market Prices
                </h4>
              </div>
              <div className="divide-y divide-neutral-50">
                {prices.prices.slice(0, 5).map((p, i) => (
                  <div 
                    key={i} 
                    className="px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors"
                  >
                    <div>
                      <span className="font-medium text-neutral-800">{p.city}</span>
                      {p.min_price && p.max_price && (
                        <span className="text-xs text-neutral-400 block">
                          Range: ₹{p.min_price} - ₹{p.max_price}
                        </span>
                      )}
                    </div>
                    <span className="text-lg font-bold text-primary-600">
                      ₹{p.modal_price}<span className="text-sm font-normal text-neutral-400">/q</span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 14-Day Forecast */}
          {prices.forecast && prices.forecast.length > 0 && (
            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
              <div className="px-4 py-3 border-b border-amber-100">
                <h4 className="font-semibold text-amber-800 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  14-Day Price Forecast
                </h4>
              </div>
              <div className="p-4">
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                  {prices.forecast.map((f, i) => (
                    <div 
                      key={i} 
                      className="flex-shrink-0 bg-white/80 backdrop-blur rounded-xl px-3 py-2 text-center min-w-[70px] snap-start border border-amber-100/50"
                    >
                      <span className="text-xs text-amber-600 block mb-0.5">{f.date}</span>
                      <span className="font-bold text-amber-900">₹{Math.round(f.modal_price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Last Updated */}
          {prices.lastUpdated && (
            <p className="text-xs text-neutral-400 text-center">
              Last updated: {prices.lastUpdated}
            </p>
          )}
        </div>
      ) : null}
    </>
  );

  if (inline) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Market Prices</h1>
          <p className="text-sm text-neutral-600">मंडी भाव</p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <Modal 
      title="Market Prices" 
      subtitle="मंडी भाव"
      onClose={onClose ?? (() => {})}
      footer={footerContent}
      size="lg"
    >
      {content}
    </Modal>
  );
}
