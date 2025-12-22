import React, { useEffect, useState } from 'react';
import { WeatherModal as WeatherComponent } from '@/components/WeatherModal';
import Card, { CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

type Forecast = {
  day: string;
  icon: string;
  hi: number;
  lo: number;
  rain: number;
  advisory?: string;
};

function ForecastCard({ item, onSelect }: { item: Forecast; onSelect: (f: Forecast) => void }) {
  return (
    <button
      onClick={() => onSelect(item)}
      className="focus:outline-none"
      aria-label={`Select ${item.day} forecast`}
    >
      <Card variant="elevated" padding="sm" className="w-full sm:w-44 hover:shadow-lg transition rounded-md">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 text-3xl">{item.icon}</div>
          <div className="flex-1 text-left">
            <div className="text-sm font-semibold text-neutral-700">{item.day}</div>
            <div className="text-xs text-neutral-500 mt-1">{item.hi}° / {item.lo}° • ☔ {item.rain}%</div>
          </div>
        </div>
      </Card>
    </button>
  );
}

export default function WeatherPage() {
  const sample7: Forecast[] = [
    { day: 'Today', icon: '🌧️', hi: 30, lo: 22, rain: 70, advisory: 'High winds + water logging predicted — secure support.' },
    { day: 'Tue', icon: '⛅', hi: 31, lo: 23, rain: 20, advisory: 'Light showers — safe to spray in dry windows.' },
    { day: 'Wed', icon: '☀️', hi: 33, lo: 24, rain: 5, advisory: 'Sunny — ideal for foliar feeding.' },
    { day: 'Thu', icon: '🌦️', hi: 29, lo: 21, rain: 55, advisory: 'Heavy showers likely — delay fertilizer application.' },
    { day: 'Fri', icon: '🌧️', hi: 28, lo: 20, rain: 80, advisory: 'Persistent rain — check drainage and stored seed.' },
    { day: 'Sat', icon: '⛈️', hi: 27, lo: 19, rain: 85, advisory: 'Thunderstorms — secure greenhouse panels.' },
    { day: 'Sun', icon: '☀️', hi: 32, lo: 22, rain: 10, advisory: 'Clear — plan field operations.' },
  ];

  const [forecasts, setForecasts] = useState<Forecast[]>(sample7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Forecast | null>(null);
  const [serviceWarning, setServiceWarning] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const base = process.env.NEXT_PUBLIC_API_URL || '';

    async function loadForecast() {
      try {
        // Attempt to get browser geolocation
        let location: { lat: number; lng: number } | null = null;
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          location = await new Promise((resolve) => {
            const onSuccess = (p: GeolocationPosition) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
            const onError = () => resolve(null);
            try {
              navigator.geolocation.getCurrentPosition(onSuccess, onError, { timeout: 5000 });
            } catch (e) {
              resolve(null);
            }
          });
          if (!location) {
            setServiceWarning('Geolocation not available or permission denied; using sample location.');
          }
        } else {
          setServiceWarning('Geolocation not supported by this browser; using sample data.');
        }

        const res = await fetch(`${base}/api/weather_forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          if (res.status === 401 || text.toLowerCase().includes('unauthorized')) {
            setServiceWarning('Weather service unauthorized (missing API key).');
          } else if (res.status === 405) {
            setServiceWarning('Weather API not accepting POST requests (405).');
          }
          throw new Error(`Status ${res.status} ${text}`);
        }

        const data = await res.json();
        const list = data?.daily ?? data ?? [];
        if (Array.isArray(list) && mounted) {
          const mapped = list.slice(0, 7).map((d: any, i: number) => ({
            day: d.day ?? d.dt_txt ?? ['Today','Tue','Wed','Thu','Fri','Sat','Sun'][i] ?? `Day ${i+1}`,
            icon: d.icon ?? (d.weather && d.weather[0] && d.weather[0].emoji) ?? '🌤️',
            hi: d.hi ?? d.temp?.max ?? Math.round((d.temp?.day ?? 30)),
            lo: d.lo ?? d.temp?.min ?? Math.round((d.temp?.night ?? 20)),
            rain: d.rain ?? Math.round((d.pop ?? 0) * 100),
            advisory: d.advisory ?? undefined,
          }));
          setForecasts(mapped.length ? mapped : sample7);
        } else if (mounted) {
          setForecasts(sample7);
        }
        if (mounted) setError(null);
      } catch (err) {
        if (!mounted) return;
        const msg = (err as any)?.message || String(err);
        if (msg.includes('405')) setServiceWarning('Weather API not accepting POST requests (405).');
        setError(`Could not load forecast (${msg})`);
        setForecasts(sample7);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadForecast();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="min-h-screen bg-surface-50 py-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-neutral-900">Weather & Impact Forecast</h1>
            <p className="text-sm md:text-base text-neutral-500 mt-1 max-w-xl">Impact-Based Weather (IBF) tailored to your crops, crop stage and local risks — tactical guidance for the next 7–14 days.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => window.open('/diagnostic', '_self')}>Diagnostics</Button>
            <Button onClick={() => window.location.reload()}>Refresh</Button>
          </div>
        </div>

        {serviceWarning && <Alert variant="warning" title="Service" className="mb-4">{serviceWarning}</Alert>}

        <div className="grid grid-cols-12 gap-6">
          <main className="col-span-12 lg:col-span-8">
            <Card variant="glass" padding="lg">
              <CardHeader title="Local Weather Snapshot" subtitle="Tap a day for micro-advisories" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <div className="mb-4">
                    <WeatherComponent inline />
                  </div>
                  <div className="rounded-md bg-white/40 p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-neutral-700">7-Day Forecast</h4>
                      <div className="text-xs text-neutral-500">{loading ? 'Updating…' : error ? 'Using sample data' : 'Live'}</div>
                    </div>
                    {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
                    <div className="mt-3">
                      <div className="flex gap-3 overflow-x-auto py-1">
                        {forecasts.slice(0,7).map((s, i) => (
                          <div key={i} className="min-w-[10rem]">
                            <ForecastCard item={s} onSelect={(f) => setSelected(f)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {selected && (
                    <Card className="mt-4">
                      <CardHeader title={`Advisory — ${selected.day}`} subtitle={`${selected.hi}° / ${selected.lo}° • ☔ ${selected.rain}%`} />
                      <div className="p-3 text-sm text-neutral-700">
                        <p>{selected.advisory ?? 'No specific advisory — monitor conditions and follow IBF guidelines.'}</p>
                      </div>
                    </Card>
                  )}
                </div>
                <div className="lg:col-span-1">
                  <div className="space-y-4">
                    <Card>
                      <CardHeader title="Key Metrics" subtitle="Quick glance" />
                      <div className="p-3 text-sm text-neutral-700 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-neutral-500">Temp (now)</div>
                          <div className="font-semibold">{forecasts[0]?.hi}°</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-neutral-500">Precip. Chance</div>
                          <div className="font-semibold">{forecasts[0]?.rain}%</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-neutral-500">Advisory</div>
                          <div className="text-sm text-neutral-600">{selected ? 'Selected day' : 'Tap a day'}</div>
                        </div>
                      </div>
                    </Card>

                    <Card>
                      <CardHeader title="Micro-Advisory" subtitle="Tomato — Vegetative" />
                      <div className="p-3 text-sm text-neutral-700">
                        <ul className="list-disc pl-5 space-y-2">
                          <li>High winds + water logging predicted on Thu — secure support for vines.</li>
                          <li>Delay fertilizer application if rain &gt; 20mm expected within 24h.</li>
                          <li>Consider mulching if heavy rain forecast to reduce seed displacement.</li>
                        </ul>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            </Card>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader title="Impact Matrix" subtitle="Nominal vs Effective Prices" />
                <div className="p-3 text-sm text-neutral-700">
                  <p className="text-xs text-neutral-500 mb-2">Distance-adjusted mandi choices help avoid transport losses.</p>
                  <div className="flex items-center gap-3">
                    <div className="text-sm">
                      <div className="text-neutral-500 text-xs">Nearest Mandi</div>
                      <div className="font-semibold">Amritsar</div>
                      <div className="text-xs text-neutral-400">Modal: ₹2,200 / Effective: ₹2,140</div>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="Quick Tips" subtitle="What to do now" />
                <div className="p-3 text-sm text-neutral-700">
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Monitor soil moisture sensors after heavy rain.</li>
                    <li>Delay spray operations during active precipitation windows.</li>
                    <li>Use rope supports for high-value fruiting plants before forecasted gusts.</li>
                  </ol>
                </div>
              </Card>

              <Card>
                <CardHeader title="Field Checklist" subtitle="Pre/post event" />
                <div className="p-3 text-sm text-neutral-700">
                  <ul className="space-y-2">
                    <li className="text-xs">Check drainage channels after heavy rain.</li>
                    <li className="text-xs">Secure coverings before predicted gusts.</li>
                    <li className="text-xs">Record crop stage for advisory accuracy.</li>
                  </ul>
                </div>
              </Card>
            </div>
          </main>

          <aside className="col-span-12 lg:col-span-4">
            <Card>
              <CardHeader title="Alerts & Advisories" subtitle="Impact-Based Warnings" />
              <div className="p-3 text-sm text-neutral-700 space-y-3">
                <div className="bg-amber-50 border border-amber-100 p-3 rounded">
                  <div className="font-semibold">Flood Watch — 48h</div>
                  <div className="text-xs text-neutral-500">Localized river rise expected — secure stored seed.</div>
                </div>
                <div className="bg-red-50 border border-red-100 p-3 rounded">
                  <div className="font-semibold">Heat Alert — 3 days</div>
                  <div className="text-xs text-neutral-500">Shade and extra irrigation recommended for seedlings.</div>
                </div>
                <div>
                  <h5 className="text-sm font-semibold mt-2">Why this matters</h5>
                  <p className="text-xs text-neutral-500">IBF maps weather hazards to crop stage to provide tactical guidance (e.g., suspend fertilizer when rain &gt; 30mm during sowing).</p>
                </div>
              </div>
            </Card>

            <Card className="mt-4">
              <CardHeader title="Local Resources" subtitle="Contacts & Help" />
              <div className="p-3 text-sm text-neutral-700">
                <p className="text-xs text-neutral-500">Krishi Vigyan Kendra: +91-11-XXXX-XXXX</p>
                <p className="text-xs text-neutral-500 mt-2">Nearest mandi updates and transport tips are shown in Market tab.</p>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
