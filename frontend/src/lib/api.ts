/**
 * API Client for KisanBuddy Backend
 * Handles all API calls with offline fallback to IndexedDB
 * Supports research-grade orchestration with XAI trace
 */

// Default backend for local development when `NEXT_PUBLIC_API_URL` is not set
// During development we run the backend on port 8000 (uvicorn), so prefer that.
const DEFAULT_LOCAL_BACKEND = 'http://localhost:8000';

// Resolve API URL at runtime. Strategy:
// 1. If `NEXT_PUBLIC_API_URL` was baked into the build, prefer it.
// 2. If running in a browser on localhost/127.0.0.1, assume backend at port 8080.
// 3. Otherwise default to the current page origin so same-origin deployments work.
function resolveApiUrl(): string {
  try {
    if (typeof window !== 'undefined') {
      const env = (process.env && (process.env.NEXT_PUBLIC_API_URL as string)) || '';
      if (env) return env;
      const hostIsLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (hostIsLocal) return DEFAULT_LOCAL_BACKEND;
      return window.location.origin;
    }
  } catch (e) {
    // ignore and fall through
  }
  return (process.env && (process.env.NEXT_PUBLIC_API_URL as string)) || DEFAULT_LOCAL_BACKEND;
}

export const API_URL = resolveApiUrl();

export function getApiUrl(): string {
  return API_URL;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  offline: boolean;
}

export async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: any
): Promise<ApiResponse<T>> {
  const MAX_RETRIES = 2;
  // Increase default timeout to reduce spurious aborts during slow local dev
  const TIMEOUT_MS = 60000; // 60s

  const token = typeof window !== 'undefined' ? localStorage.getItem('km_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Attach user's selected language (persisted in localStorage by I18nProvider)
  try {
    if (typeof window !== 'undefined') {
      const preferred = (localStorage.getItem('kb_lang') || navigator.language || 'en').split('-')[0];
      if (preferred) headers['X-KB-Lang'] = preferred;
      // If caller provided a JSON body/object, inject `lang` so backend can condition responses
      if (body && typeof body === 'object' && !(body instanceof FormData) && !body.lang) {
        body.lang = preferred;
      }
    }
  } catch (e) {}
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), TIMEOUT_MS)
      : undefined;

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller ? controller.signal : undefined,
      });

      if (timeout) clearTimeout(timeout);

      if (!response.ok) {
        let parsed: any = null;
        try {
          parsed = await response.clone().json();
        } catch (e) {
          // not JSON
        }
        const text = parsed ? JSON.stringify(parsed) : await response.text().catch(() => '');
        const msg = `API ${method} ${endpoint} failed: ${response.status} ${response.statusText} ${text}`;
        lastError = new Error(msg);
        // Handle rate limiting (429) with retry-after/backoff
        if (response.status === 429 && attempt < MAX_RETRIES) {
          let waitMs = 2000 * (attempt + 1); // default 2s, then 4s
          const ra = response.headers.get && response.headers.get('Retry-After');
          if (ra) {
            const raNum = Number(ra);
            if (!isNaN(raNum)) waitMs = raNum * 1000;
          } else if (parsed && parsed.detail) {
            const m = String(parsed.detail).match(/Retry after\s*(\d+)\s*seconds?/i);
            if (m) waitMs = Number(m[1]) * 1000;
          }
          try {
            if (typeof window !== 'undefined' && window?.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('kisanbuddy:api-rate-limit', { detail: { endpoint, method, retryAfterMs: waitMs } }));
            }
          } catch (e) {}
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        // Retry on 5xx
        if (response.status >= 500 && attempt < MAX_RETRIES) continue;
        throw lastError;
      }

      const data = await response.json().catch(() => null);
      return { data, error: null, offline: false };
    } catch (err) {
      if (timeout) clearTimeout(timeout);
      lastError = err;
      const e: any = err;
      // network failures / aborts -> retry
      const isAbort = e && (e.name === 'AbortError' || e.code === 'ECONNABORTED' || String(e).toLowerCase().includes('aborted'));
      const isNetwork = e && (e instanceof TypeError || (e.message && e.message.match(/NetworkError|Failed to fetch/i)));
      if ((isAbort || isNetwork) && attempt < MAX_RETRIES) {
        // small backoff
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }

      // Normalize abort error message so UI can surface a friendly string
      const message = e instanceof Error ? e.message : String(e);
      const normalizedMessage = isAbort ? 'Request aborted (timeout or navigation).' : message;
      // Avoid noisy behavior for aborted requests (HMR / navigations).
      const isAbortError = e && (e.name === 'AbortError' || (e instanceof Error && String(e.message).toLowerCase().includes('aborted')) || (e && (e.code === 'ECONNABORTED' || e.code === 'ERR_CANCELED')));

      // Emit a window event for UI layers to listen and show toasts, but skip for aborts
      if (!isAbortError) {
        try {
          if (typeof window !== 'undefined' && window?.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('kisanbuddy:api-error', { detail: { endpoint, method, message } }));
          }
        } catch (e) {
          // ignore
        }

        // Also log to console to make debugging visible during development
        // eslint-disable-next-line no-console
        console.error('[apiCall] ', method, endpoint, message);
      }

      return {
        data: null,
        error: normalizedMessage,
        offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
      };
    }
  }

  const finalMessage = lastError instanceof Error ? lastError.message : 'Unknown error';
  return { data: null, error: finalMessage, offline: typeof navigator !== 'undefined' ? !navigator.onLine : false };
}

// Vision Diagnostic
export async function diagnoseCrop(imageBase64: string, crop?: string, location?: { lat: number; lng: number }) {
  return apiCall<{
    diagnosis: string;
    confidence: number;
    warnings: string[];
  }>('/api/vision_diagnostic', 'POST', {
    image_base64: imageBase64,
    crop,
    location,
  });
}

// Vision diagnostic accepting either base64 or image_url (preferred for uploads)
export async function visionDiagnostic(payload: { image_base64?: string; image_url?: string; crop?: string; location?: { lat:number; lng:number } }) {
  return apiCall<any>('/api/vision_diagnostic', 'POST', payload);
}

// Market Prices
export async function getMarketPrices(commodity: string, market?: string, state?: string) {
  return apiCall<{
    prices: Array<{
      city: string;
      commodity: string;
      min_price: number;
      max_price: number;
      modal_price: number;
      date: string;
    }>;
    forecast: Array<{ date: string; modal_price: number }>;
  }>('/api/agmarknet_proactive', 'POST', {
    commodity,
    market,
    state,
  });
}

// Nearby mandis by location
export async function getNearbyPrices(
  commodity: string,
  location: { lat: number; lng: number },
  radius_km = 200,
  top_n = 20,
  fuel_rate_per_ton_km?: number,
  mandi_fees?: number
) {
  return apiCall<{
    nearby: Array<{
      city: string;
      state?: string;
      modal_price: number;
      distance_km: number;
      effective_price: number;
      lat?: number;
      lon?: number;
    }>;
  }>('/api/agmarknet_nearby', 'POST', {
    commodity,
    location,
    radius_km,
    top_n,
    fuel_rate_per_ton_km,
    mandi_fees,
  });
}

// POST a FormData body (multipart) with the same resilience guarantees
export async function formPost<T>(endpoint: string, form: FormData): Promise<ApiResponse<T>> {
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 120000; // larger for uploads (120s) to allow slow AI backends
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : undefined;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('km_token') : null;
      const headers: Record<string, string> = {};
      try {
        if (typeof window !== 'undefined') {
          const preferred = (localStorage.getItem('kb_lang') || navigator.language || 'en').split('-')[0];
          if (preferred) headers['X-KB-Lang'] = preferred;
          // ensure FormData contains lang for backend
          if (!form.get('lang')) form.append('lang', preferred);
        }
      } catch (e) {}
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: form as any,
        signal: controller ? controller.signal : undefined,
      });

      if (timeout) clearTimeout(timeout);
      if (!response.ok) {
        let parsed: any = null;
        try {
          parsed = await response.clone().json();
        } catch (e) {
          // not JSON
        }
        const text = parsed ? JSON.stringify(parsed) : await response.text().catch(() => '');
        const msg = `API form POST ${endpoint} failed: ${response.status} ${response.statusText} ${text}`;
        lastError = new Error(msg);
        // Handle rate limiting (429)
        if (response.status === 429 && attempt < MAX_RETRIES) {
          let waitMs = 2000 * (attempt + 1);
          const ra = response.headers.get && response.headers.get('Retry-After');
          if (ra) {
            const raNum = Number(ra);
            if (!isNaN(raNum)) waitMs = raNum * 1000;
          } else if (parsed && parsed.detail) {
            const m = String(parsed.detail).match(/Retry after\s*(\d+)\s*seconds?/i);
            if (m) waitMs = Number(m[1]) * 1000;
          }
          try {
            if (typeof window !== 'undefined' && window?.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('kisanbuddy:api-rate-limit', { detail: { endpoint, method: 'POST', retryAfterMs: waitMs } }));
            }
          } catch (e) {}
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        if (response.status >= 500 && attempt < MAX_RETRIES) continue;
        throw lastError;
      }

      const data = await response.json().catch(() => null);
      return { data, error: null, offline: false };
    } catch (err) {
      if (timeout) clearTimeout(timeout);
      lastError = err;
      const e: any = err;
      const isAbort = e && (e.name === 'AbortError' || e.code === 'ECONNABORTED');
      const isNetwork = e && (e instanceof TypeError || (e.message && e.message.match(/NetworkError|Failed to fetch/i)));
      if ((isAbort || isNetwork) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }

      const message = e instanceof Error ? e.message : String(e);
      const isAbortError = e && (e.name === 'AbortError' || (e instanceof Error && String(e.message).toLowerCase().includes('aborted')) || (e && (e.code === 'ECONNABORTED' || e.code === 'ERR_CANCELED')));

      if (!isAbortError) {
        try {
          if (typeof window !== 'undefined' && window?.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('kisanbuddy:api-error', { detail: { endpoint, method: 'POST', message } }));
          }
        } catch (e) {}
        // eslint-disable-next-line no-console
        console.error('[formPost] ', endpoint, message);
      }

      return { data: null, error: message, offline: typeof navigator !== 'undefined' ? !navigator.onLine : false };
    }
  }
  const finalMessage = lastError instanceof Error ? lastError.message : 'Unknown error';
  return { data: null, error: finalMessage, offline: typeof navigator !== 'undefined' ? !navigator.onLine : false };
}

// Auth: register/login
export async function registerUser(username: string, password: string, region?: string) {
  return apiCall<{ user: any; token: string }>('/api/register', 'POST', { username, password, region });
}

export async function loginUser(username: string, password: string) {
  return apiCall<{ user: any; token: string }>('/api/login', 'POST', { username, password });
}

// Diagnosis history
export async function saveDiagnosis(diagnosisJson: any) {
  return apiCall<{ saved: any }>('/api/diagnosis_history', 'POST', diagnosisJson);
}

export async function listDiagnosis() {
  return apiCall<{ history: any[] }>('/api/diagnosis_history', 'GET');
}

// Weather Hazards
export async function getHazards(location: { lat: number; lng: number }) {
  return apiCall<{
    flood_risk: number;
    drought_risk: number;
    window_days: number;
  }>('/api/earth_engine_hazards', 'POST', { location });
}

export async function getWeatherForecast(location?: { lat: number; lng: number }) {
  return apiCall<any>('/api/weather_forecast', 'POST', { location });
}

export async function filterMarkets(markets: Array<{ name: string }>, location: { lat: number; lng: number }, radius_km: number) {
  return apiCall<{ markets: any[] }>('/api/filter_markets', 'POST', { markets, location, radius_km });
}

// Parcel Info
export async function getParcelInfo(plusCode?: string, location?: { lat: number; lng: number }) {
  return apiCall<{
    s2_cell: string;
    parcel_features: Record<string, any>;
  }>('/api/anthrokrishi_parcel', 'POST', {
    plus_code: plusCode,
    location,
  });
}

// Planner
export async function planTasks(intent: string, inputs: Record<string, any>) {
  return apiCall<{
    tasks: Array<{
      task_type: string;
      priority: number;
      inputs: Record<string, any>;
    }>;
  }>('/api/plan', 'POST', { intent, inputs });
}

// Validator
export async function validateRecommendations(
  crop: string,
  recommendations: Array<{ pesticide: string; [key: string]: any }>,
  context?: { rain_forecast?: boolean; region?: string }
) {
  return apiCall<{
    validated: Array<any>;
    warnings: string[];
  }>('/api/validate', 'POST', {
    crop,
    recommendations,
    context,
  });
}

// =============================================================================
// ORCHESTRATION API - Research-Grade ReAct Framework
// =============================================================================

/**
 * Thought step in the reasoning scratchpad
 */
export interface ThoughtStep {
  id: string;
  stage: 'input' | 'validation' | 'analysis' | 'reasoning' | 'output' | 'action';
  thought: string;
  action?: string;
  observation?: string;
  confidence: number;
  metadata?: Record<string, any>;
}

/**
 * Confidence breakdown with evidence
 */
export interface ConfidenceBreakdown {
  overall: number;
  components: Record<string, number>;
  reasoning: string;
}

/**
 * Full execution trace for XAI overlay
 */
export interface ExecutionTrace {
  trace_id: string;
  session_id: string;
  started_at: number;
  completed_at?: number;
  duration_ms?: number;
  status: string;
  thoughts: ThoughtStep[];
  confidence?: ConfidenceBreakdown;
  errors: Array<{ error: string; task_id?: string }>;
}

/**
 * Recommendation from the orchestrator
 */
export interface Recommendation {
  type: 'diagnosis' | 'market' | 'hazard' | 'warning' | 'clarification';
  priority: 'high' | 'medium' | 'low';
  title: string;
  action: string;
  confidence: number;
  details?: Record<string, any>;
}

/**
 * Full orchestration response
 */
export interface OrchestrationResult {
  status: 'success' | 'error';
  results: Array<Record<string, any>>;
  task_summary: {
    total: number;
    successful: number;
    failed: number;
  };
  confidence: ConfidenceBreakdown;
  validation?: {
    validated: Array<any>;
    warnings: string[];
  };
  recommendations: Recommendation[];
  trace?: ExecutionTrace;
  warnings: string[];
}

/**
 * Orchestrate a complex query through the ReAct framework.
 * 
 * This is the main entry point for research-grade agentic workflows.
 * Returns full execution trace for XAI transparency.
 * 
 * @param intent - Natural language description of what the user wants
 * @param inputs - Structured inputs (image, location, crop, etc.)
 * @param options - Optional configuration
 */
export async function orchestrate(
  intent: string,
  inputs: Record<string, any>,
  options: {
    sessionId?: string;
    includeTrace?: boolean;
  } = {}
): Promise<ApiResponse<OrchestrationResult>> {
  return apiCall<OrchestrationResult>('/api/orchestrate', 'POST', {
    intent,
    inputs,
    session_id: options.sessionId,
    include_trace: options.includeTrace ?? true,
  });
}

/**
 * Enhanced chat with wayfinder suggestions
 */
export interface ChatResult {
  reply: string;
  suggestions: string[];
  intent_detected?: string;
}

export async function chat(message: string, language: string = 'en') {
  return apiCall<ChatResult>('/api/chat', 'POST', { message, language });
}

export async function visionChat(payload: { message: string; image_base64?: string; image_url?: string; language?: string }) {
  return apiCall<ChatResult>('/api/vision_chat', 'POST', payload);
}
