import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function SoilTestPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileList | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!files || files.length === 0) {
      setError('Please select at least one soil image');
      return;
    }
    const form = new FormData();
    for (let i = 0; i < files.length; i++) form.append('images', files[i]);
    if (lat && lng) {
      form.append('location_lat', lat);
      form.append('location_lng', lng);
    }
    if (notes) form.append('notes', notes);

    try {
      setLoading(true);
      const apiBase = (process.env.NEXT_PUBLIC_API_URL as string) || 'http://localhost:8080';
      const res = await fetch(`${apiBase}/api/soil_test`, { method: 'POST', body: form });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Server error');
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to run soil test');
    } finally {
      setLoading(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files;
    setFiles(f);
    setPreviews([]);
    if (f && f.length) {
      const arr: string[] = [];
      for (let i = 0; i < f.length; i++) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target && typeof ev.target.result === 'string') {
            arr.push(ev.target.result);
            // once all read, update
            if (arr.length === f.length) setPreviews(arr);
          }
        };
        reader.readAsDataURL(f[i]);
      }
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <main className="max-w-5xl mx-auto px-6 lg:px-8">
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Soil Test</h1>
            <div className="text-sm text-neutral-500">Upload clear photos (1–4). Report is indicative.</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Soil Images</label>
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="mt-1" />

                {previews.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {previews.map((p, i) => (
                      <div key={i} className="w-full h-24 overflow-hidden rounded border">
                        <img src={p} alt={`preview-${i}`} className="object-cover w-full h-full" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700">Latitude</label>
                    <input type="text" value={lat} onChange={(e) => setLat(e.target.value)} className="mt-1 w-full" placeholder="21.2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700">Longitude</label>
                    <input type="text" value={lng} onChange={(e) => setLng(e.target.value)} className="mt-1 w-full" placeholder="81.3" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-sm font-medium text-neutral-700">Farmer notes</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full" rows={4} placeholder="Recent crop, irrigation, fertiliser used..."></textarea>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>{loading ? 'Analysing…' : 'Run Soil Test'}</Button>
              <Button variant="ghost" onClick={() => router.push('/')}>Back</Button>
              <Button variant="ghost" onClick={() => { setFiles(null); setPreviews([]); setReport(null); setError(null); }}>Reset</Button>
            </div>
          </form>

          {error && <div className="mt-4 text-red-600">Error: {error}</div>}

          {report && (
            <div className="mt-6 space-y-4">
              <div className="bg-white p-4 rounded shadow-sm">
                <h2 className="text-xl font-semibold">🌱 Soil Condition Summary</h2>
                <p className="mt-2">{report.summary}</p>
              </div>

              <div className="bg-white p-4 rounded shadow-sm grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold">🔍 What the Soil Image Shows</h3>
                  <pre className="mt-2 text-sm bg-neutral-100 p-3 rounded overflow-auto">{JSON.stringify(report.what_images_show, null, 2)}</pre>
                </div>
                <div>
                  <h3 className="font-semibold">⚠️ Problems Identified</h3>
                  <ul className="list-disc ml-6 mt-2">{report.problems_identified.length ? report.problems_identified.map((p: string, i: number) => <li key={i}>{p}</li>) : <li>None obvious from images</li>}</ul>
                </div>
              </div>

              <div className="bg-white p-4 rounded shadow-sm">
                <h3 className="font-semibold">🧪 Likely Nutrient Status (Indicative)</h3>
                <pre className="mt-2 text-sm bg-neutral-100 p-3 rounded overflow-auto">{JSON.stringify(report.likely_nutrient_status, null, 2)}</pre>
              </div>

              <div className="bg-white p-4 rounded shadow-sm grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold">🌿 Natural Improvements (No chemicals first)</h3>
                  <ul className="list-disc ml-6 mt-2">{report.natural_improvements.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div>
                  <h3 className="font-semibold">🌾 Crop Recommendations</h3>
                  <p className="mt-2"><strong>Best:</strong> {report.crop_recommendations.best.join(', ')}</p>
                  <p><strong>Avoid:</strong> {report.crop_recommendations.avoid.join(', ')}</p>
                </div>
              </div>

              <div className="bg-white p-4 rounded shadow-sm">
                <h3 className="font-semibold">📍 Nearby Government Soil Testing Centers</h3>
                {report.nearby_centers && report.nearby_centers.length ? (
                  <ul className="mt-2">
                    {report.nearby_centers.map((c: any, i: number) => (
                      <li key={i} className="mb-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-sm text-neutral-600">{c.service} — {c.distance_km} km</div>
                          </div>
                          {lat && lng && (
                            <a target="_blank" rel="noreferrer" className="text-sm text-primary-600 ml-4" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name)}`}>Open in Maps</a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="mt-2 text-sm text-neutral-600">No nearby centers found for this location.</div>}
              </div>

              <div className="text-sm text-neutral-600">{report.confidence_note}</div>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
