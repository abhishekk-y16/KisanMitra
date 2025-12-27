import React, { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { getApiUrl, saveDiagnosis } from '@/lib/api';
import { Modal } from './Modal';
import ResultHeaderCard from './ui/ResultHeaderCard';
import { Button, Alert, Card } from './ui';

interface TreatmentDetails {
  immediateActions: string[];
  organicRemedies: string[];
  futurePrevention: string[];
}

interface DiagnosisResult {
  diagnosis: string;
  diagnosisHindi?: string;
  crop?: string;
  confidence: number;
  symptoms?: string[];
  warnings?: string[];
  treatment?: string | TreatmentDetails;
  severity?: 'low' | 'medium' | 'high';
  affected_parts?: string[];
  estimated_yield_loss_pct?: { min: number; max: number };
  provider?: string;
}

interface DiagnosticModalProps {
  onClose?: () => void;
  inline?: boolean;
  onDiagnose?: (result: DiagnosisResult) => void;
}

function isTreatmentDetails(t: any): t is TreatmentDetails {
  return t && typeof t === 'object' && Array.isArray(t.immediateActions);
}

export function DiagnosticModal({ onClose, inline = false, onDiagnose }: DiagnosticModalProps) {
  const [image, setImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceWarning, setServiceWarning] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const apiBase = getApiUrl();

  const handleCapture = () => fileRef.current?.click();

  const demoResult = (): DiagnosisResult => ({
    diagnosis: 'Powdery mildew',
    diagnosisHindi: 'पाउडरी मिल्ड्यू',
    crop: 'Tomato',
    confidence: 0.78,
    symptoms: ['White powdery patches on leaves', 'Yellowing of leaves'],
    severity: 'medium',
    warnings: ['If left untreated, powdery mildew can significantly reduce crop yield'],
    treatment: {
      immediateActions: ['Remove infected leaves', 'Improve air circulation'],
      organicRemedies: ['Neem oil spray', 'Milk spray (1:10 ratio)'],
      futurePrevention: ['Regularly inspect plants', 'Maintain humidity control'],
    },
    affected_parts: ['Leaves'],
    estimated_yield_loss_pct: { min: 5, max: 12 },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setImage(dataUrl);

      try {
        setLoading(true);
        // try upload via central formPost (gives timeouts/retries and error events)
        const blob = await (await fetch(dataUrl)).blob();
        const form = new FormData();
        form.append('file', blob, 'upload.jpg');
        const { formPost, visionDiagnostic } = await import('@/lib/api');
        const up = await formPost<any>('/api/upload_image', form);
        if (up.error) {
          throw new Error(up.error);
        }
        const j = up.data;
        const full = `${apiBase.replace(/\/$/, '')}${j.url}`;
        setImageUrl(full);

        // call diagnostic endpoint via central client
        const payload: any = {};
        // Provide both an uploaded URL and the base64 payload so the backend
        // can choose the most reliable source. Some environments may make
        // the uploaded URL inaccessible to the backend fetch, so sending
        // base64 prevents "image not accessible" fallbacks.
        if (full) payload.image_url = full;
        if (selectedCrop) payload.crop = selectedCrop;
        try {
          payload.image_base64 = dataUrl.split(',')[1];
        } catch (e) {
          // If splitting fails, omit base64 and rely on image_url
        }
        // No soil metadata attached from crop diagnostic modal
        const diag = await visionDiagnostic(payload);
        if (diag.error) {
          setServiceWarning(diag.error);
          const demo = demoResult();
          setResult(demo);
          if (typeof onDiagnose === 'function') onDiagnose(demo);
        } else {
          const r = diag.data as DiagnosisResult;
          setResult(r);
          if (typeof onDiagnose === 'function') onDiagnose(r);
        }
      } catch (err: any) {
        const message = err?.message || String(err) || 'Upload failed';
        setError(message);
        setServiceWarning(message);
        const demo = demoResult();
        setResult(demo);
        if (typeof onDiagnose === 'function') onDiagnose(demo);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const reset = () => {
    setImage(null);
    setImageUrl(null);
    setResult(null);
    setError(null);
  };

  const footer = result ? (
    <Button variant="primary" onClick={reset} fullWidth>
      Scan Another Crop | दूसरी फसल स्कैन करें
    </Button>
  ) : undefined;

  const content = (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {serviceWarning && (
        <Card className="bg-amber-50 border-amber-200 p-3">
          <div className="text-sm font-semibold">AI service temporarily unavailable</div>
          <div className="text-xs text-neutral-700 mt-1 break-words">{serviceWarning}</div>
          <div className="text-xs mt-2"><a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404" target="_blank" rel="noreferrer" className="text-primary-600 underline">Learn more</a></div>
        </Card>
      )}

      {!image ? (
        <div className="space-y-6">
            <div className="max-w-xs mx-auto text-center">
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 mb-2">Select Crop</label>
              <select value={selectedCrop ?? ''} onChange={(ev) => setSelectedCrop(ev.target.value || null)} className="w-full border rounded p-2">
                <option value="" disabled>-- Select Crop --</option>
                <option>Tomato</option>
                <option>Potato</option>
                <option>Rice</option>
                <option>Wheat</option>
                <option>Maize</option>
                <option>Chillies</option>
                <option>Okra</option>
                <option>Eggplant</option>
                <option>Cotton</option>
                <option>Soybean</option>
              </select>
            </div>
            
            <div className="mb-4">
              <svg className="w-12 h-12 text-neutral-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
            </div>
            <Button variant="primary" onClick={handleCapture} fullWidth disabled={loading}>{loading ? 'Processing…' : 'Take Photo | फोटो लें'}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ResultHeaderCard
            diagnosis={result?.diagnosis || 'Unknown'}
            diagnosisHindi={result?.diagnosisHindi}
            crop={result?.crop}
            confidence={result?.confidence ?? 0}
            severity={result?.severity}
            imageSrc={image || imageUrl}
            onSave={() => {}}
            onShare={() => {}}
          />

          <div className="mt-3">
            <label className="block text-sm font-medium text-neutral-700 mb-2">Select Crop</label>
            <select value={selectedCrop ?? (result?.crop ?? '')} onChange={(ev) => setSelectedCrop(ev.target.value || null)} className="w-48 border rounded p-2">
              <option value="" disabled>-- Select Crop --</option>
              <option>Tomato</option>
              <option>Potato</option>
              <option>Rice</option>
              <option>Wheat</option>
              <option>Maize</option>
              <option>Chillies</option>
              <option>Okra</option>
              <option>Eggplant</option>
              <option>Cotton</option>
              <option>Soybean</option>
            </select>
          </div>

          { !inline && (
            <>
              <div className="flex gap-2 mt-3">
                <Button variant="secondary" onClick={async () => {
                  setSyncing(true);
                  setSyncMessage(null);
                  try {
                    // Attempt to save diagnosis to server (requires auth token)
                    const payload: any = { ...result };
                    if (imageUrl) payload.image_url = imageUrl; // include uploaded URL when available
                    const res = await saveDiagnosis(payload as any);
                    if (res && (res as any).error) {
                      setSyncMessage('Sync failed: ' + (res as any).error);
                    } else {
                      setSyncMessage('Synced to your history');
                    }
                  } catch (e: any) {
                    setSyncMessage('Sync failed: ' + (e?.message || String(e)));
                  } finally {
                    setSyncing(false);
                  }
                }} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync'}</Button>
                {syncMessage && <div className="text-sm text-neutral-600">{syncMessage}</div>}
              </div>
            </>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h4 className="text-2xl font-bold mb-3">Symptoms</h4>
              <ul className="list-disc pl-5 space-y-2">
                {(result?.symptoms ?? []).length > 0 ? (result!.symptoms!.map((s, i) => <li key={i}>{s}</li>)) : <li>No symptoms detected</li>}
              </ul>
            </Card>

            <Card>
              <h4 className="text-2xl font-bold mb-3">Treatment</h4>
              {typeof result?.treatment === 'string' ? (
                <p>{result.treatment}</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-lg font-bold">Immediate Actions</div>
                    <ol className="list-decimal pl-5">
                      {isTreatmentDetails(result?.treatment) && result!.treatment.immediateActions.length > 0 ? result!.treatment.immediateActions.map((a, i) => <li key={i}>{a}</li>) : <li>No immediate actions suggested</li>}
                    </ol>
                  </div>

                  <div>
                    <div className="text-lg font-bold">Organic Remedies</div>
                    <ul className="list-disc pl-5">
                      {isTreatmentDetails(result?.treatment) && result!.treatment.organicRemedies.length > 0 ? result!.treatment.organicRemedies.map((r, i) => <li key={i}>{r}</li>) : <li>No organic remedies suggested</li>}
                    </ul>
                  </div>

                  <div>
                    <div className="text-lg font-bold">Future Prevention</div>
                    <ul className="list-disc pl-5">
                      {isTreatmentDetails(result?.treatment) && result!.treatment.futurePrevention.length > 0 ? result!.treatment.futurePrevention.map((t, i) => <li key={i}>{t}</li>) : <li>No prevention tips available</li>}
                    </ul>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {result?.warnings && result.warnings.length > 0 && (
            <Card>
              <div className="text-xs text-red-700 font-semibold mb-2">Warnings</div>
              <div className="text-sm text-red-700 space-y-2">
                {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="text-xs text-neutral-500">Confidence</div>
              <div className="text-lg font-semibold">{Math.round((result?.confidence ?? 0) * 100)}%</div>
            </Card>

            <Card>
              <div className="text-xs text-neutral-500">Severity</div>
              <div className="text-sm font-semibold capitalize">{result?.severity ?? 'unknown'}</div>
            </Card>

            <Card>
              <div className="text-xs text-neutral-500">Affected parts</div>
              <div className="text-sm">{result?.affected_parts ? result.affected_parts.join(', ') : 'Leaves'}</div>
            </Card>
          </div>
        </div>
      )}
    </>
  );

  if (inline) return <div className="max-w-6xl mx-auto p-8">{content}</div>;

  return (
    <Modal title="Crop Health Check" subtitle="फसल स्वास्थ्य जांच" onClose={onClose ?? (() => {})} footer={footer}>
      {content}
    </Modal>
  );
}
