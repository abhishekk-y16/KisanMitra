import React, { useState } from 'react';
import { MarketModal as MarketComponent } from '@/components/MarketModal';
import { Card, Button } from '@/components/ui';

export default function MarketPage() {
  const [searchCommodity, setSearchCommodity] = useState('Wheat');
  const [searchRegion, setSearchRegion] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  return (
    <div className="min-h-screen pb-20 bg-neutral-50">
      <div className="max-w-[1440px] mx-auto px-8 pt-12">
        {/* Hero */}
        <div className="rounded-3xl p-10 bg-white glass shadow-2xl border border-neutral-100">
          <div className="grid grid-cols-12 gap-8 items-center">
            <div className="col-span-8">
              <h1 className="text-4xl font-extrabold text-neutral-900 mb-2">Mandi Prices & Market Signals</h1>
              <p className="text-lg text-neutral-600 mb-4">Live mandi prices, distance‑adjusted effective price, short‑term forecasts, and recommended actions tailored to your farm.</p>
              <div className="flex items-center gap-4">
                <Button variant="primary" onClick={() => window.scrollTo({ top: 520, behavior: 'smooth' })}>Explore Prices</Button>
                <Button variant="secondary" onClick={() => window.open('/diagnostic', '_self')}>Scan Crop</Button>
                <Button variant="ghost" onClick={() => window.open('/saved', '_self')}>Saved Reports</Button>
              </div>
            </div>

            <div className="col-span-4 hidden lg:block">
              <div className="rounded-2xl overflow-hidden shadow-lg">
                <img src="/icons/diagnose-illustration.svg" alt="market illustration" className="w-full h-48 object-cover" />
              </div>
            </div>
          </div>
        </div>

        {/* Grid: prices + side utilities */}
        <div className="grid grid-cols-12 gap-8 mt-8">
          <main className="col-span-8">
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">Nearest Market & Effective Price</h3>
                    <p className="text-sm text-neutral-500">Distance‑adjusted modal price and mandi fees applied</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => window.location.reload()}>Refresh</Button>
                    <Button variant="secondary" onClick={() => alert('Export CSV not implemented')}>Export</Button>
                  </div>
                </div>

                <MarketComponent inline />
              </Card>

              <Card className="p-6">
                <h4 className="font-semibold mb-3">14‑day Price Forecast</h4>
                <div className="grid grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                      <div className="text-sm text-neutral-500">Day {i + 1}</div>
                      <div className="text-lg font-bold mt-1">₹{2400 + i * 8}</div>
                      <div className="text-xs text-neutral-400 mt-1">Trend: Stable</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </main>

          <aside className="col-span-4 space-y-6">
            <Card className="p-4">
              <h4 className="font-semibold mb-2">Search Markets</h4>
              <div className="space-y-3">
                <input value={searchCommodity} onChange={(e)=>setSearchCommodity(e.target.value)} placeholder="Commodity (e.g., Wheat)" className="input" />
                <input value={searchRegion} onChange={(e)=>setSearchRegion(e.target.value)} placeholder="State or District" className="input" />
                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={async ()=>{
                    setSearchError(null);
                    setSearchResults(null);
                    if (!searchCommodity) { setSearchError('Enter a commodity'); return; }
                    setSearchLoading(true);
                    try {
                      const base = (process.env.NEXT_PUBLIC_API_URL as string) || 'http://localhost:8080';
                      const res = await fetch(`${base}/api/agmarknet_proactive`, {
                        method: 'POST', headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ commodity: searchCommodity, state: searchRegion || undefined })
                      });
                      if (!res.ok) {
                        const txt = await res.text().catch(()=>null);
                        throw new Error(txt || 'Server error');
                      }
                      const j = await res.json();
                      setSearchResults(j.prices || []);
                    } catch (err: any) {
                      setSearchError(err?.message || 'Failed to fetch');
                    } finally { setSearchLoading(false); }
                  }}>{searchLoading ? 'Searching…' : 'Find Markets'}</Button>
                  <Button variant="ghost" onClick={()=>{ setSearchCommodity('Wheat'); setSearchRegion(''); setSearchResults(null); setSearchError(null); }}>Reset</Button>
                </div>

                {searchError && <div className="text-sm text-red-600">{searchError}</div>}
                {searchResults && searchResults.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm text-neutral-500 mb-2">Showing top {Math.min(10, searchResults.length)} markets</div>
                    <ul className="space-y-2">
                      {searchResults.slice(0,10).map((r:any,i:number)=> (
                        <li key={i} className="p-2 bg-white rounded border border-neutral-100 flex items-center justify-between">
                          <div>
                            <div className="font-medium">{r.city || r.market || r.name}</div>
                            <div className="text-xs text-neutral-500">₹{r.modal_price} • {r.date || ''}</div>
                          </div>
                          <a className="text-primary-600 text-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.city || r.market || '')}`}>Maps</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="font-semibold mb-2">How Effective Price is calculated</h4>
              <p className="text-sm text-neutral-700">Effective Price = Modal Price − (Distance × Fuel Rate/MT) − Mandi Fees. Distance is calculated using your selected market coordinates.</p>
            </Card>

            <Card className="p-4">
              <h4 className="font-semibold mb-2">Quick Actions</h4>
              <div className="flex flex-col gap-3">
                <Button variant="secondary" onClick={() => window.open('/register', '_self')}>Set My Farm Location</Button>
                <Button variant="ghost" onClick={() => window.open('/help', '_self')}>Help & Docs</Button>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
