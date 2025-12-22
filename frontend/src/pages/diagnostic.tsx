import React from 'react';
import { DiagnosticModal as DiagnosticComponent } from '@/components/DiagnosticModal';
import Card, { CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function DiagnosticPage() {
  const recent = [
    { id: 1, crop: 'Tomato', date: '2025-12-18', result: 'Bacterial spot', confidence: 0.82 },
    { id: 2, crop: 'Wheat', date: '2025-12-14', result: 'Rust (early)', confidence: 0.73 },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="max-w-screen-2xl mx-auto px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-neutral-900">Crop Diagnostics</h1>
            <p className="text-sm text-neutral-500 mt-1">Upload a leaf photo or capture with your phone to get an instant diagnosis and treatment plan.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => window.open('/weather', '_self')}>Weather</Button>
            <Button onClick={() => window.open('/market', '_self')}>Market Prices</Button>
            <Button variant="ghost" onClick={() => window.open('/chat', '_self')}>Chat</Button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-8">
          <main className="col-span-12 lg:col-span-9">
            <Card padding="lg" className="mb-6">
              <CardHeader title="Scan a Crop" subtitle="Get diagnosis, confidence, and step-by-step treatment" />
              <div className="mt-4">
                <DiagnosticComponent inline />
              </div>
            </Card>

            {/* 'How it works' card removed per request */}
          </main>

          <aside className="col-span-12 lg:col-span-3">
            <Card>
              <CardHeader title="Recent Scans" subtitle="Quick access" />
              <div className="p-3">
                {recent.length === 0 ? (
                  <EmptyState icon="📷" title="No recent scans" description="Scan a crop to see results here." />
                ) : (
                  <ul className="space-y-3">
                    {recent.map((r) => (
                      <li key={r.id} className="p-3 border border-neutral-100 rounded-lg bg-white">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-neutral-900">{r.crop}</div>
                            <div className="text-xs text-neutral-500">{r.date}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-medium">{r.result}</div>
                            <div className="text-xs text-neutral-500">{Math.round(r.confidence * 100)}%</div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            <Card className="mt-4">
              <CardHeader title="Tips & Best Practices" subtitle="Capture guidance" />
              <div className="p-3 text-sm text-neutral-700">
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <span className="font-medium">Use a plain background:</span> place the leaf against a plain, contrasting background and fill the frame so the leaf is clearly visible.
                  </li>
                  <li>
                    <span className="font-medium">Good lighting:</span> prefer daylight or even lighting; avoid harsh shadows or backlight that hide lesions.
                  </li>
                  <li>
                    <span className="font-medium">Multiple angles:</span> take close-up photos of affected areas and one wider shot showing the whole plant or branch when possible.
                  </li>
                  <li>
                    <span className="font-medium">Stable focus:</span> ensure images are sharp (tap to focus on phone) and avoid motion blur.
                  </li>
                  <li>
                    <span className="font-medium">Include context:</span> note recent irrigation, sprays, or weather if you can — add this in the question box for better diagnosis.
                  </li>
                </ul>
              </div>
            </Card>

            <Card className="mt-4">
              <CardHeader title="Resources" subtitle="Local help" />
              <div className="p-3 text-sm text-neutral-700">
                <p className="text-xs text-neutral-500">Krishi Vigyan Kendra nearest: +91-11-XXXX-XXXX</p>
                <p className="text-xs text-neutral-500 mt-2">Use Market tab to compare effective mandi prices after diagnosis and harvest planning.</p>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
