import { useState, useRef, useCallback, useEffect } from 'react';
import { Modal } from './Modal';
import { ConfidenceMeter, Skeleton, Alert, Button, Badge, Card } from './ui';

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
}

interface DiagnosticModalProps {
  onClose?: () => void;
  inline?: boolean; // when true render as a full page component instead of modal
}

export function DiagnosticModal({ onClose, inline = false }: DiagnosticModalProps) {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const processFile = useCallback(async (file: File) => {
    // Validate file
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size should be less than 10MB');
      return;
    }
    setError(null);

    // Helper: resize & compress image to a JPEG data URL
    const compressImageToDataUrl = (file: File, maxDim = 800, quality = 0.7): Promise<string> => {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          try {
            const { width, height } = img;
            let newW = width;
            let newH = height;
            if (Math.max(width, height) > maxDim) {
              if (width > height) {
                newW = maxDim;
                newH = Math.round((height / width) * maxDim);
              } else {
                newH = maxDim;
                newW = Math.round((width / height) * maxDim);
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = newW;
            canvas.height = newH;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas not supported');
            ctx.drawImage(img, 0, 0, newW, newH);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            URL.revokeObjectURL(url);
            resolve(dataUrl);
          } catch (e) {
            URL.revokeObjectURL(url);
            reject(e);
          }
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load image'));
        };
        img.src = url;
      });
    };

    setLoading(true);
    try {
      const originalSizeKB = Math.round(file.size / 1024);

      const attempts = [
        { maxDim: 800, quality: 0.7 },
        { maxDim: 600, quality: 0.6 },
        { maxDim: 400, quality: 0.5 },
      ];

      let success = false;
      let lastError: any = null;

      for (let i = 0; i < attempts.length; i++) {
        const { maxDim, quality } = attempts[i];
        // eslint-disable-next-line no-console
        console.debug(`[Diagnostic] attempt ${i + 1}: compress ${maxDim}px @${quality}`);
        const dataUrl = await compressImageToDataUrl(file, maxDim, quality);
        const base64 = dataUrl.split(',')[1];
        const compressedSizeKB = Math.round(((base64.length * 3) / 4) / 1024);
        // eslint-disable-next-line no-console
        console.debug('[Diagnostic] originalKB:', originalSizeKB, 'compressedKB:', compressedSizeKB);
        // show the preview of the most recent compressed image
        setImage(dataUrl);

        // Debug logging to help trace uploads in browser console
        // eslint-disable-next-line no-console
        console.debug('[Diagnostic] uploading image preview (base64 start):', base64?.slice(0, 80));

        try {
          // First try: upload compressed file to backend so Groq receives a short URL
          const blob = await (await fetch(dataUrl)).blob();
          const form = new FormData();
          form.append('file', blob, 'upload.jpg');

          let uploadOk = false;
          let imageUrl: string | null = null;
          try {
            const ures = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload_image`, {
              method: 'POST',
              body: form,
            });
            if (ures.ok) {
              const uj = await ures.json();
              imageUrl = uj.url;
              uploadOk = true;
              // eslint-disable-next-line no-console
              console.debug('[Diagnostic] uploaded image URL:', imageUrl);
            } else {
              // eslint-disable-next-line no-console
              console.warn('[Diagnostic] upload endpoint responded non-OK, falling back to base64');
            }
          } catch (ue) {
            // eslint-disable-next-line no-console
            console.warn('[Diagnostic] upload failed, will fallback to base64:', ue);
          }

          const payload: any = { _nonce: Date.now() };
          if (uploadOk && imageUrl) payload.image_url = imageUrl;
          else payload.image_base64 = base64;

          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vision_diagnostic`, {
            method: 'POST',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json();
            // eslint-disable-next-line no-console
            console.debug('[Diagnostic] response preview:', data?.diagnosis || data);
            setResult(data);
            success = true;
            break;
          }

          // If Groq returns 413, try a smaller image
          if (res.status === 413) {
            // eslint-disable-next-line no-console
            console.warn('[Diagnostic] server returned 413 Payload Too Large, will retry with smaller image');
            lastError = new Error('Payload Too Large');
            continue;
          }

          const text = await res.text().catch(() => '');
          throw new Error(`Server error ${res.status}: ${text}`);
        } catch (err) {
          // if fetch/network error, record and try next compression
          // eslint-disable-next-line no-console
          console.error('[Diagnostic] upload attempt failed:', err);
          lastError = err;
          // continue to next attempt
        }
      }

      if (!success) {
        throw lastError || new Error('All upload attempts failed');
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Diagnosis failed:', err);
      const msg = (err && err.message) ? err.message : String(err);
      setError(`Could not analyze image: ${msg}`);
      setResult({
        diagnosis: 'Analysis Failed',
        confidence: 0,
        warnings: [msg || 'Could not connect to server. Try again later.'],
        severity: 'low',
      });
    }
    setLoading(false);
  }, []);

  // Auto-save diagnosis when result appears and user is logged in
  // We send the raw result JSON to backend; Authorization handled by api client
  const saveResultIfLoggedIn = async (res: DiagnosisResult | null) => {
    if (!res) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('km_token') : null;
      if (!token) return; // not logged in
      // call saveDiagnosis endpoint
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/diagnosis_history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(res),
      });
    } catch (e) {
      // ignore save errors silently
      console.debug('Failed to auto-save diagnosis:', e);
    }
  };
  // watch result changes
  useEffect(() => {
    saveResultIfLoggedIn(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const reset = () => {
    setImage(null);
    setResult(null);
    setError(null);
  };

  const getSeverityColor = (severity?: string): 'error' | 'warning' | 'success' => {
    switch (severity) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      default: return 'success';
    }
  };

  const getSeverityLabel = (severity?: string): string => {
    switch (severity) {
      case 'high': return 'High Severity';
      case 'medium': return 'Medium Severity';
      default: return 'Low Severity';
    }
  };

  const isTreatmentDetails = (t: string | TreatmentDetails | undefined): t is TreatmentDetails => {
    return typeof t === 'object' && t !== null && 'immediateActions' in t;
  };

  const healthTips = [
    {
      icon: (
        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: 'Check Leaves Daily',
      titleHindi: 'रोजाना पत्तियां जांचें',
      desc: 'Regular monitoring helps early detection',
    },
    {
      icon: (
        <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      title: 'Pest Control',
      titleHindi: 'कीट नियंत्रण',
      desc: 'Use organic methods when possible',
    },
    {
      icon: (
        <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      title: 'Water Management',
      titleHindi: 'जल प्रबंधन',
      desc: 'Proper irrigation prevents disease',
    },
  ];

  const footerContent = result ? (
    <Button variant="primary" onClick={reset} fullWidth size="lg">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      Scan Another Crop | दूसरी फसल स्कैन करें
    </Button>
  ) : undefined;

  const inner = (
    <>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {error && (
        <Alert variant="error" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!image ? (
        /* Upload State */
        <div className="space-y-6">
          {/* Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              relative
              border-2 border-dashed rounded-2xl
              py-12 px-6
              text-center
              transition-all duration-200
              ${dragActive 
                ? 'border-primary-500 bg-primary-50' 
                : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-neutral-100'
              }
            `}
          >
            <div className="max-w-xs mx-auto">
              <div className={`
                w-16 h-16 mx-auto mb-4
                flex items-center justify-center
                rounded-2xl
                ${dragActive ? 'bg-primary-100' : 'bg-white shadow-sm'}
                transition-colors duration-200
              `}>
                <svg className={`w-8 h-8 ${dragActive ? 'text-primary-600' : 'text-neutral-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">
                {dragActive ? 'Drop your image here' : 'Upload leaf photo'}
              </h3>
              <p className="text-sm text-neutral-500 mb-4">
                Drag & drop or click to capture
              </p>
              <Button variant="primary" size="lg" onClick={handleCapture} fullWidth>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Take Photo | फोटो लें
              </Button>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Tips for best results
            </h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>• Capture the affected leaf clearly</li>
              <li>• Use good lighting (daylight preferred)</li>
              <li>• Avoid blurry or distant photos</li>
            </ul>
          </div>
        </div>
      ) : (
        /* Results State */
        <div className="space-y-5">
          {/* Image Preview - Compact */}
          <div className="relative rounded-xl overflow-hidden bg-neutral-100 max-w-[200px]">
            <img 
              src={image} 
              alt="Captured leaf" 
              className="w-full aspect-square object-cover"
            />
            {loading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-3 border-primary-200 border-t-primary-600 animate-spin" />
              </div>
            )}
          </div>
          
          {/* Results */}
          {loading ? (
            <div className="space-y-4">
              <Skeleton.Text lines={2} />
              <Skeleton className="h-8 w-48" />
              <Skeleton.Text lines={4} />
            </div>
          ) : result ? (
            <div className="space-y-5">
              {/* Disease Header */}
              <div className="bg-gradient-to-r from-primary-50 to-green-50 rounded-2xl p-5 border border-primary-100">
                <div className="flex flex-col gap-3">
                  {/* Disease Name */}
                  <div>
                    <h3 className="text-xl font-bold text-neutral-900 mb-1">
                      {result.diagnosisHindi || result.diagnosis}
                    </h3>
                    {result.diagnosisHindi && (
                      <p className="text-sm text-neutral-600">{result.diagnosis}</p>
                    )}
                  </div>
                  
                  {/* Badges Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {result.severity && (
                      <Badge variant={getSeverityColor(result.severity)} size="md">
                        {getSeverityLabel(result.severity)}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-neutral-200">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        result.confidence >= 0.8 ? 'bg-green-500' : 
                        result.confidence >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                      <span className="text-sm font-semibold text-neutral-700">
                        {Math.round(result.confidence * 100)}% Confidence
                      </span>
                    </div>
                  </div>
                  
                  {/* Crop Type */}
                  {result.crop && (
                    <p className="text-sm text-neutral-600 flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      {result.crop}
                    </p>
                  )}
                </div>
              </div>

              {/* Symptoms Section */}
              {result.symptoms && result.symptoms.length > 0 && (
                <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                  <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200">
                    <h4 className="font-semibold text-neutral-900 flex items-center gap-2">
                      <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Symptoms | लक्षण
                    </h4>
                  </div>
                  <ul className="divide-y divide-neutral-100">
                    {result.symptoms.map((symptom, i) => (
                      <li key={i} className="px-4 py-3 flex items-start gap-3">
                        <span className="text-amber-500 mt-0.5">•</span>
                        <span className="text-sm text-neutral-700">{symptom}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Treatment Sections */}
              {result.treatment && isTreatmentDetails(result.treatment) && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-neutral-900 flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Treatment | उपचार
                  </h4>

                  {/* Immediate Actions */}
                  {result.treatment.immediateActions.length > 0 && (
                    <div className="bg-red-50 rounded-xl border border-red-100 overflow-hidden">
                      <div className="px-4 py-3 bg-red-100/50 border-b border-red-100">
                        <h5 className="font-medium text-red-800 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                          </svg>
                          Immediate Actions | तुरंत कार्रवाई
                        </h5>
                      </div>
                      <ul className="p-4 space-y-2">
                        {result.treatment.immediateActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                            <span className="font-bold text-red-600">{i + 1}.</span>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Organic Remedies */}
                  {result.treatment.organicRemedies.length > 0 && (
                    <div className="bg-green-50 rounded-xl border border-green-100 overflow-hidden">
                      <div className="px-4 py-3 bg-green-100/50 border-b border-green-100">
                        <h5 className="font-medium text-green-800 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                          Organic Remedies | जैविक उपचार
                        </h5>
                      </div>
                      <ul className="p-4 space-y-2">
                        {result.treatment.organicRemedies.map((remedy, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                            <span className="text-green-600">•</span>
                            {remedy}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Future Prevention */}
                  {result.treatment.futurePrevention.length > 0 && (
                    <div className="bg-blue-50 rounded-xl border border-blue-100 overflow-hidden">
                      <div className="px-4 py-3 bg-blue-100/50 border-b border-blue-100">
                        <h5 className="font-medium text-blue-800 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          Future Prevention | भविष्य में रोकथाम
                        </h5>
                      </div>
                      <ul className="p-4 space-y-2">
                        {result.treatment.futurePrevention.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-blue-800">
                            <span className="text-blue-600">•</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Legacy treatment string fallback */}
              {result.treatment && typeof result.treatment === 'string' && (
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <h4 className="font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Treatment
                  </h4>
                  <p className="text-sm text-neutral-600">{result.treatment}</p>
                </div>
              )}

              {/* Crop Health Tips */}
              <div className="pt-4 border-t border-neutral-200">
                <h4 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Crop Health Tips | फसल स्वास्थ्य सुझाव
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {healthTips.map((tip, i) => (
                    <div key={i} className="bg-neutral-50 rounded-xl p-3 text-center border border-neutral-100 hover:border-primary-200 hover:bg-primary-50 transition-colors">
                      <div className="w-10 h-10 mx-auto mb-2 bg-white rounded-full flex items-center justify-center shadow-sm">
                        {tip.icon}
                      </div>
                      <h5 className="text-xs font-semibold text-neutral-900 mb-0.5">{tip.title}</h5>
                      <p className="text-[10px] text-neutral-500">{tip.titleHindi}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Crop Health Check</h1>
          <p className="text-sm text-neutral-600">फसल स्वास्थ्य जांच</p>
        </div>
        {inner}
      </div>
    );
  }

  return (
    <Modal 
      title="Crop Health Check" 
      subtitle="फसल स्वास्थ्य जांच"
      onClose={onClose ?? (() => {})}
      footer={footerContent}
    >
      {inner}
    </Modal>
  );
}
