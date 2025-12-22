import React, { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { getApiUrl } from '@/lib/api';
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
}

interface DiagnosticModalProps {
  onClose?: () => void;
  inline?: boolean;
}

function isTreatmentDetails(t: any): t is TreatmentDetails {
  return t && typeof t === 'object' && Array.isArray(t.immediateActions);
}

export function DiagnosticModal({ onClose, inline = false }: DiagnosticModalProps) {
  const [image, setImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceWarning, setServiceWarning] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

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
        // try upload
        const blob = await (await fetch(dataUrl)).blob();
        const form = new FormData();
        form.append('file', blob, 'upload.jpg');
        const res = await fetch(`${getApiUrl()}/api/upload_image`, { method: 'POST', body: form });
        if (res.ok) {
          const j = await res.json();
          // `upload_image` returns a relative path like `/static/tmp_uploads/xxx`.
          // Store a full URL so the browser can fetch the preview from the backend host.
          const full = `${getApiUrl().replace(/\/$/, '')}${j.url}`;
          setImageUrl(full);
        }

        // call diagnostic endpoint
        const payload: any = {};
        if (imageUrl) payload.image_url = imageUrl; else payload.image_base64 = dataUrl.split(',')[1];
        const r = await fetch(`${getApiUrl()}/api/vision_diagnostic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (r.ok) {
          const j = await r.json();
          setResult(j as DiagnosisResult);
        } else {
          // try to extract server error message (may be text or json)
          let msg = 'AI service temporarily unavailable.';
          try {
            const j = await r.json();
            msg = j?.detail || JSON.stringify(j);
          } catch (e) {
            try {
              msg = await r.text();
            } catch {
              /* ignore */
            }
          }
          setServiceWarning(`${msg}`);
          setResult(demoResult());
        }
      } catch (err: any) {
        const message = err?.message || String(err) || 'Upload failed';
        setError(message);
        setServiceWarning(message);
        setResult(demoResult());
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

          <div className="flex gap-2 mt-3">
            <Button variant="secondary" onClick={() => {
              // prepare chat prefill payload and navigate
              const payload: any = { imageUrl: imageUrl || null };
              if (!payload.imageUrl && image) payload.imageBase64 = image;
              // Clear any previous prefill
              try { sessionStorage.setItem('chat_prefill', JSON.stringify(payload)); } catch (e) { /* ignore */ }
              router.push('/chat');
            }}>Open in Chat</Button>
          </div>

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
