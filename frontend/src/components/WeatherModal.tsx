import { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { Button, Card, Badge, Skeleton, Alert } from './ui';

interface HazardData {
  flood_risk: number;
  drought_risk: number;
  frost_risk?: number;
  heatwave_risk?: number;
  recommendations?: string[];
}

interface WeatherModalProps {
  onClose?: () => void;
  inline?: boolean;
}

export function WeatherModal({ onClose, inline = false }: WeatherModalProps) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [hazards, setHazards] = useState<HazardData | null>(null);
  const [forecast, setForecast] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          setLocationError(true);
          setLoading(false);
        },
        { timeout: 10000, maximumAge: 300000 }
      );
    } else {
      setLocationError(true);
      setLoading(false);
    }
  }, []);

    // Reverse geocode to a human-readable place name using Nominatim (OpenStreetMap)
    useEffect(() => {
      let mounted = true;
      async function fetchPlaceName() {
        if (!location) {
          setPlaceName(null);
          return;
        }
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.lat}&lon=${location.lng}`;
          const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'KisanMitra/1.0 (dev)' } });
          if (!mounted) return;
          if (!res.ok) {
            setPlaceName(null);
            return;
          }
          const data = await res.json();
          const display = data.display_name || data.name || null;
          setPlaceName(display);
        } catch (e) {
          setPlaceName(null);
        }
      }
      fetchPlaceName();
      return () => { mounted = false; };
    }, [location]);

  const fetchHazards = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    setError(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

      // Fetch Earth Engine hazards (satellite-derived)
      const resHaz = await fetch(`${base}/api/earth_engine_hazards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location }),
      });
      if (resHaz.ok) {
        const data = await resHaz.json();
        setHazards(data);
      } else {
        // Keep non-fatal: show message but continue to fetch forecast
        const txt = await resHaz.text();
        console.warn('Earth Engine hazards fetch failed:', resHaz.status, txt);
      }

      // Fetch meteorological forecast (OpenWeatherMap / configured backend)
      const resF = await fetch(`${base}/api/weather_forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location }),
      });
      if (!resF.ok) {
        const body = await resF.text();
        throw new Error(`Server error fetching forecast: ${resF.status} ${body}`);
      }
      const fdata = await resF.json();
      setForecast(fdata.forecast || fdata);
    } catch (err) {
      console.error('Failed to fetch hazards:', err);
      setError(err instanceof Error ? err.message : 'Could not fetch weather data. Please try again.');
    }
    setLoading(false);
  }, [location]);

  useEffect(() => {
    if (location) fetchHazards();
  }, [location, fetchHazards]);

  const getRiskLevel = (risk: number) => {
    if (risk < 0.2) return { label: 'Low', labelHi: 'कम', variant: 'success', description: 'No immediate concerns' };
    if (risk < 0.5) return { label: 'Medium', labelHi: 'मध्यम', variant: 'warning', description: 'Monitor conditions closely' };
    return { label: 'High', labelHi: 'उच्च', variant: 'error', description: 'Take precautionary measures' };
  };

  const safeNumber = (v: any, fallback: number | null = null) => {
    if (v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const currentTempDisplay = (f: any) => {
    const t = safeNumber(f?.current?.temp, null);
    return t === null ? '—' : `${Math.round(t)}°C`;
  };

  const currentSummary = (f: any) => {
    if (!f?.current) return '';
    const temp = safeNumber(f.current.temp, null);
    const feels = safeNumber(f.current.feels_like, null);
    const hum = safeNumber(f.current.humidity, null);
    const wind = safeNumber(f.current.wind_speed, null);
    const desc = f.current.weather?.[0]?.description || '';
    const parts: string[] = [];
    if (temp !== null) parts.push(`${Math.round(temp)}°C`);
    if (desc) parts.push(desc);
    if (feels !== null) parts.push(`Feels like ${Math.round(feels)}°C`);
    if (hum !== null) parts.push(`Humidity: ${hum}%`);
    if (wind !== null) parts.push(`Wind: ${Math.round(wind)} m/s`);
    return parts.join(' • ');
  };

  function formatCoord(value: number, type: 'lat' | 'lng') {
    if (value === null || value === undefined) return '—';
    const abs = Math.abs(Number(value));
    const deg = abs.toFixed(4);
    if (type === 'lat') return `${deg}°${value >= 0 ? 'N' : 'S'}`;
    return `${deg}°${value >= 0 ? 'E' : 'W'}`;
  }

  const RiskCard = ({ icon, label, labelHi, risk, gradient }: { icon: string; label: string; labelHi: string; risk: number; gradient: string }) => {
    const level = getRiskLevel(risk as number) as any;
    const percentage = Math.round((risk || 0) * 100);
    return (
      <Card className="overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${gradient}`}>
                <span className="text-2xl">{icon}</span>
              </div>
              <div>
                <h4 className="font-semibold text-neutral-900">{label}</h4>
                <p className="text-sm text-neutral-500">{labelHi}</p>
              </div>
            </div>
            <Badge variant={level.variant} size="md">
              {level.label}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Risk Level</span>
              <span className="font-semibold text-neutral-900">{percentage}%</span>
            </div>
            <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  level.variant === 'success' ? 'bg-emerald-500' : level.variant === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.max(percentage, 5)}%` }}
              />
            </div>
            <p className="text-xs text-neutral-400">{level.description}</p>
          </div>
        </div>
      </Card>
    );
  };

  const footerContent = hazards ? (
    <Button variant="secondary" onClick={fetchHazards} fullWidth>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh Data
    </Button>
  ) : undefined;

  const content = (
    <>
      {locationError ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">Location Required</h3>
          <p className="text-sm text-neutral-500 mb-6 max-w-xs mx-auto">Please enable location access to view weather hazards for your area.</p>
          <Button variant="primary" onClick={() => window.location.reload()}>Enable Location</Button>
        </div>
      ) : error ? (
        <div>
          <Alert variant="error" className="mb-4">
            {error}
            <Button variant="secondary" size="sm" onClick={fetchHazards} className="mt-3">Try Again</Button>
          </Alert>
          <p className="text-xs text-neutral-400 text-center">Data source: Google Earth Engine / IMD</p>
        </div>
      ) : loading || !hazards ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Skeleton className="w-12 h-12 rounded-2xl" />
            <div>
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      ) : (
        <div className="space-y-4">
          {location && (
            <div className="flex items-center gap-2 px-3 py-2 bg-neutral-50 rounded-xl text-sm text-neutral-600">
              <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              <div>
                <div className="font-medium text-neutral-800">
                  {placeName ? `${placeName} — ` : ''}
                  {formatCoord(location.lat, 'lat')}, {formatCoord(location.lng, 'lng')}
                </div>
                {forecast && (
                  <div className="text-xs text-neutral-500">{currentSummary(forecast)}</div>
                )}
              </div>
              <Badge variant="secondary" size="sm" className="ml-auto">14-day forecast</Badge>
            </div>
          )}

          {/* Satellite preview */}
          <div>
            {location ? (
              process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
                <div className="rounded-xl overflow-hidden border">
                  <a href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`} target="_blank" rel="noreferrer">
                    <img
                      alt="Satellite preview"
                      src={`https://maps.googleapis.com/maps/api/staticmap?center=${location.lat},${location.lng}&zoom=12&size=640x240&maptype=satellite&markers=color:0xFF0000%7C${location.lat},${location.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                      className="w-full h-auto block"
                    />
                  </a>
                  <p className="text-xs text-neutral-400 p-2">Satellite preview (Google Maps). Tap image to open full map.</p>
                </div>
              ) : (
                <Card className="p-3 text-sm text-neutral-500">Satellite preview not available — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your environment.</Card>
              )
            ) : null}
          </div>

          <div className="flex items-center justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowWhy(true)}>Why am I seeing this?</Button>
          </div>

          {forecast && (
            <Card className="mt-4">
              <div className="p-4">
                <h4 className="font-semibold mb-2">Current Conditions</h4>
                <div className="flex items-center gap-4">
                  <div className="text-3xl">{currentTempDisplay(forecast)}</div>
                  <div>
                    <div className="text-sm text-neutral-600">{safeNumber(forecast?.current?.feels_like) !== null ? `Feels like ${Math.round(Number(forecast.current.feels_like))}°C` : ''}</div>
                    <div className="text-xs text-neutral-500">{safeNumber(forecast?.current?.humidity) !== null ? `Humidity: ${Math.round(Number(forecast.current.humidity))}%` : ''}{safeNumber(forecast?.current?.wind_speed) !== null ? ` • Wind: ${Math.round(Number(forecast.current.wind_speed))} m/s` : ''}</div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <RiskCard icon="🌊" label="Flood Risk" labelHi="बाढ़ जोखिम" risk={hazards.flood_risk} gradient="bg-gradient-to-br from-blue-100 to-cyan-100" />
          <RiskCard icon="☀️" label="Drought Risk" labelHi="सूखा जोखिम" risk={hazards.drought_risk} gradient="bg-gradient-to-br from-orange-100 to-yellow-100" />

          {hazards.frost_risk !== undefined && (
            <RiskCard icon="❄️" label="Frost Risk" labelHi="पाला जोखिम" risk={hazards.frost_risk} gradient="bg-gradient-to-br from-slate-100 to-blue-100" />
          )}

          {hazards.heatwave_risk !== undefined && (
            <RiskCard icon="🔥" label="Heatwave Risk" labelHi="लू जोखिम" risk={hazards.heatwave_risk} gradient="bg-gradient-to-br from-red-100 to-orange-100" />
          )}

          {hazards.recommendations && hazards.recommendations.length > 0 && (
            <Card className="bg-primary-50 border-primary-100">
              <div className="p-4">
                <h4 className="font-semibold text-primary-800 flex items-center gap-2 mb-3">Recommendations</h4>
                <ul className="space-y-2">
                  {hazards.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-primary-700"><span className="text-primary-500 mt-0.5">•</span>{rec}</li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          <p className="text-xs text-neutral-400 text-center">Data source: Google Earth Engine / IMD</p>
        </div>
      )}
      {showWhy && (
        <Modal title="Why these hazards?" subtitle="Explanation" onClose={() => setShowWhy(false)}>
          <div className="p-3 space-y-3 text-sm text-neutral-700">
            <p>The hazard scores are computed from recent satellite-derived indicators (soil moisture, river inundation indices, and vegetation stress) and meteorological forecasts. We combine these to estimate short-term flood and drought risk for your location.</p>
            <p>Flood risk increases after heavy rainfall or rising river levels; drought risk rises when precipitation and soil moisture are below normal. These are probabilistic estimates — use local observations alongside advisories.</p>
            <p className="text-xs text-neutral-400">Data sources: Google Earth Engine (satellite imagery), IMD forecasts.</p>
          </div>
        </Modal>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Weather Hazards</h2>
            <p className="text-sm text-neutral-500">मौसम चेतावनी</p>
          </div>
        </div>
        <div className="space-y-4">{content}</div>
        <div className="mt-4">{footerContent}</div>
      </div>
    );
  }

  return (
    <Modal title="Weather Hazards" subtitle="मौसम चेतावनी" onClose={onClose ?? (() => {})} footer={footerContent}>
      {content}
    </Modal>
  );
}
