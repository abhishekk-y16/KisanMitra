/**
 * API Client for Kisan-Mitra Backend
 * Handles all API calls with offline fallback to IndexedDB
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  offline: boolean;
}

async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: any
): Promise<ApiResponse<T>> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('km_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return { data, error: null, offline: false };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      offline: !navigator.onLine,
    };
  }
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
