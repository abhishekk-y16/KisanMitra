import React from 'react';
import { MarketModal as MarketComponent } from '@/components/MarketModal';
import { Card, Button } from '@/components/ui';

export default function MarketPage() {
  return (
    <div className="min-h-screen pb-12 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-6 pt-10">
        <div className="rounded-3xl p-8 bg-gradient-to-r from-indigo-600 via-sky-500 to-teal-400 text-white shadow-lg">
          <div className="flex items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold">Mandi Prices & Market Signals</h1>
              <p className="mt-2 text-sm opacity-90">Live mandi prices, short-term forecasts, and actionable trade signals for your region.</p>
              <div className="mt-4 flex items-center gap-3">
                <Button variant="primary" onClick={() => window.scrollTo({ top: 420, behavior: 'smooth' })}>Check Prices</Button>
                <Button variant="ghost" onClick={() => window.open('/diagnostic', '_self')}>Scan Crop</Button>
              </div>
            </div>
            <div className="hidden md:block max-w-sm">
              <img src="/icons/diagnose-illustration.svg" alt="market" className="w-full opacity-95"/>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6 mt-8">
          <main className="col-span-8">
            <Card className="p-6">
              <MarketComponent inline />
            </Card>
          </main>

          <aside className="col-span-4 space-y-6">
            <Card className="p-4">
              <h4 className="font-semibold mb-2">Algorithm — How prices are surfaced</h4>
              <ol className="text-sm text-neutral-700 space-y-2">
                <li><strong>Input:</strong> commodity name (selected), optional market/state — default uses user profile region.</li>
                <li><strong>Validation:</strong> commodity must be selected; backend provides fallback markets when missing.</li>
                <li><strong>Processing:</strong> server queries Agmarknet/CEDA, aggregates recent modal prices and computes short-term trend.</li>
                <li><strong>Decision:</strong> trend = up/down/stable based on recent slope; signal = Buy/Sell/Hold if strong move.</li>
                <li><strong>Output:</strong> price table, 14-day forecast tiles, trend badge, and recommended action.</li>
              </ol>
            </Card>

            <Card className="p-4">
              <h4 className="font-semibold mb-2">Quick Actions</h4>
              <div className="flex flex-col gap-3">
                <Button variant="secondary" onClick={() => window.open('/market', '_self')}>Add to Watchlist</Button>
                <Button variant="ghost" onClick={() => window.open('/saved', '_self')}>View Saved Reports</Button>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
