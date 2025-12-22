/**
 * API Client for KisanBuddy Backend
 * Handles all API calls with offline fallback to IndexedDB
 * Supports research-grade orchestration with XAI trace
 */

// Resolve API URL with a runtime-local override for development:
const buildApiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://kisanbuddy-coge.onrender.com' || 'http://localhost:8080';

// If running in the browser on localhost, prefer local backend (useful during dev)
function resolveApiUrl(): string {
  try {
    if (typeof window !== 'undefined') {
      const hostIsLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (hostIsLocal) return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
    }
  } catch (e) {
    // ignore and fall through
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://kisanbuddy-coge.onrender.com';
}

export const API_URL = resolveApiUrl();

// Runtime getter: prefer local backend when in browser on localhost.
export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    const hostIsLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (hostIsLocal) return 'http://localhost:8080';
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://kisanbuddy-coge.onrender.com';
}

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
