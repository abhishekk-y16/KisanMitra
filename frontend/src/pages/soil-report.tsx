import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useRouter } from 'next/router';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import ReactMarkdown from 'react-markdown';
import { getApiUrl } from '@/lib/api';

interface SoilData {
  extraction_success: boolean;
  lab_name?: string;
  report_date?: string;
  farmer_name?: string;
  village?: string;
  parameters?: {
    ph?: number | null;
    electrical_conductivity?: number | null;
    organic_carbon?: number | null;
    nitrogen_n?: number | null;
    phosphorus_p?: number | null;
    potassium_k?: number | null;
    sulphur_s?: number | null;
    zinc_zn?: number | null;
    iron_fe?: number | null;
    copper_cu?: number | null;
    manganese_mn?: number | null;
    boron_b?: number | null;
  };
  soil_texture?: string;
  recommendations?: string;
  error?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function SoilReportPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reportPreview, setReportPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [soilData, setSoilData] = useState<SoilData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [useAgent, setUseAgent] = useState(false);

  // Location state
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  // Nearby labs UI removed

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Auto-request geolocation
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(String(pos.coords.latitude));
          setLng(String(pos.coords.longitude));
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReportFile(file);
    setError(null);

    // Generate preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setReportPreview(ev.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleExtract = async () => {
    if (!reportFile) {
      setError('Please upload a soil report image first');
      return;
    }

    setExtracting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', reportFile);

      const apiBase = getApiUrl();
      const response = await fetch(`${apiBase}/api/soil_report/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.extraction_success) {
        throw new Error(data.error || 'Failed to extract soil data');
      }

      setSoilData(data);
      
      // Add welcome message to chat
      // localized assistant welcome message
      const template = t('welcomeAnalyzed');
      const lab = data.lab_name || t('theLab');
      const ph = data.parameters?.ph ?? t('unknown');
      const n = data.parameters?.nitrogen_n ?? '?';
      const p = data.parameters?.phosphorus_p ?? '?';
      const k = data.parameters?.potassium_k ?? '?';
      const welcome = template.replace('{lab}', String(lab)).replace('{ph}', String(ph)).replace('{n}', String(n)).replace('{p}', String(p)).replace('{k}', String(k));
      setChatHistory([{ role: 'assistant', content: welcome }]);

    } catch (err: any) {
      setError(err.message || 'Failed to extract report data');
    } finally {
      setExtracting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !soilData) return;

    const newMessage: ChatMessage = { role: 'user', content: userInput };
    setChatHistory(prev => [...prev, newMessage]);
    setUserInput('');
    setChatLoading(true);

    try {
      const apiBase = getApiUrl();
      let response;
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (lang) headers['x-kb-lang'] = lang;

      if (useAgent) {
        response = await fetch(`${apiBase}/api/agents/soil_analysis`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ soil_data: soilData, message: userInput, language: lang })
        });
      } else {
        response = await fetch(`${apiBase}/api/soil_report/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            soil_data: soilData,
            message: userInput,
            chat_history: chatHistory,
            language: lang
          })
        });
      }

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (useAgent) {
        // Agent returns structured JSON — show pretty JSON in chat
        const pretty = JSON.stringify(data, null, 2);
        setChatHistory(prev => [...prev, { role: 'assistant', content: pretty }]);
      } else {
        if (data.success) {
          setChatHistory(data.updated_history);
        } else {
          throw new Error(data.error || 'Chat failed');
        }
      }

    } catch (err: any) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err.message}`
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const langToSpeech = (l?: string) => {
    const map: Record<string,string> = {
      en: 'en-US', hi: 'hi-IN', bn: 'bn-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN', gu: 'gu-IN', kn: 'kn-IN', pa: 'pa-IN', ml: 'ml-IN'
    };
    return map[l || 'en'] || 'en-US';
  };

  const speakText = (text: string) => {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = langToSpeech(lang);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = langToSpeech(lang);
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (ev: any) => {
      const txt = ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript;
      if (txt) setUserInput(prev => (prev ? prev + ' ' + txt : txt));
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    return () => { try { r.onresult = null; r.onend = null; r.onerror = null; } catch(e){} };
  }, [lang]);

  const toggleListening = () => {
    const r = recognitionRef.current;
    if (!r) return;
    if (listening) {
      try { r.stop(); } catch(e){}
      setListening(false);
    } else {
      try { r.start(); setListening(true); } catch(e) { setListening(false); }
    }
  };

  // fetchNearbyCenters removed — nearby labs feature deprecated

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-neutral-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-10 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <span className="text-2xl">🧪</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-900">{t('soilReportAdvisor')}</h1>
                <p className="text-xs text-neutral-500">{t('aiPoweredCropRecommendations')}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => router.push('/')} className="text-sm">
              ← {t('home')}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-r from-indigo-100 via-purple-50 to-pink-100 border-b border-indigo-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-10 py-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 border border-indigo-200 text-xs font-semibold text-indigo-800 shadow-sm">
                <span>🤖</span>
                <span>{t('aiCropAdvisor')}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight">{t('uploadSoilReport')}</h2>
              <p className="text-sm sm:text-base text-neutral-700 max-w-2xl">{t('labAnalysisReport')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => window.open('/diagnostic','_self')}>{t('cropDiagnostics')}</Button>
              <Button variant="ghost" onClick={() => window.open('/market','_self')}>{t('viewPrices')}</Button>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 lg:px-10 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left: Upload & Extract */}
          <div className="lg:col-span-5 space-y-6">
            <Card variant="elevated" className="bg-white/95 backdrop-blur-sm shadow-xl border border-neutral-200/80">
              <div className="p-7">
                  <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center text-xl shadow-md">📄</div>
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900">{t('uploadSoilReport')}</h2>
                    <p className="text-xs text-neutral-500">{t('labAnalysisReport')}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/60 p-4">
                    <label className="cursor-pointer block">
                      <input 
                        type="file" 
                        accept="image/*,application/pdf" 
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="text-center py-8">
                        {reportPreview ? (
                          <img src={reportPreview} alt="Report preview" className="max-h-64 mx-auto rounded-lg shadow-md" />
                        ) : (
                          <>
                            <div className="text-5xl mb-3">📋</div>
                            <div className="text-sm font-semibold text-neutral-900">{t('clickToUploadReport')}</div>
                            <div className="text-xs text-neutral-600 mt-1">{t('supportsImagesAndPDFs')}</div>
                          </>
                        )}
                      </div>
                    </label>
                  </div>

                  {reportFile && (
                    <Button 
                      variant="primary" 
                      onClick={handleExtract}
                      disabled={extracting || !reportFile}
                      className="w-full"
                    >
                      {extracting ? t('extractingData') : t('extractSoilData')}
                    </Button>
                  )}

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      ⚠️ {error}
                    </div>
                  )}

                  {soilData && soilData.extraction_success && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="font-semibold text-green-900 mb-2">{t('dataExtractedSuccessfully')}</div>
                      <div className="text-xs text-neutral-700 space-y-1">
                        <div>pH: {soilData.parameters?.ph || 'N/A'}</div>
                        <div>N: {soilData.parameters?.nitrogen_n || 'N/A'} kg/ha</div>
                        <div>P: {soilData.parameters?.phosphorus_p || 'N/A'} kg/ha</div>
                        <div>K: {soilData.parameters?.potassium_k || 'N/A'} kg/ha</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Nearby Labs UI removed per project decision */}
          </div>

          {/* Right: Chat Interface */}
          <div className="lg:col-span-7">
            <Card variant="elevated" className="bg-white/95 backdrop-blur-sm shadow-xl border border-neutral-200/80">
              <div className="p-7 flex flex-col h-[700px]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 text-white flex items-center justify-center text-xl shadow-md">💬</div>
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900">AI Crop Advisor</h2>
                    <p className="text-xs text-neutral-500">Ask about crop suitability, fertilizers, and more</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <label className="text-xs text-neutral-600">Use Agent</label>
                    <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
                  </div>
                </div>

                {!soilData ? (
                  <div className="flex-1 flex items-center justify-center text-center p-8">
                    <div>
                      <div className="text-5xl mb-3">🌱</div>
                      <div className="text-lg font-semibold text-neutral-900 mb-2">Upload a soil report to start chatting</div>
                      <div className="text-sm text-neutral-600">Once extracted, I'll help you decide what to grow!</div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Chat messages */}
                    <div className="flex-1 overflow-y-auto mb-4 space-y-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                      {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] p-3 rounded-xl ${
                            msg.role === 'user' 
                              ? 'bg-indigo-600 text-white' 
                              : 'bg-white border border-neutral-200'
                          }`}>
                              <div className={`text-sm whitespace-pre-wrap flex items-start gap-2`}> 
                                <div className="flex-1">
                                  {msg.role === 'assistant' ? (
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                  ) : (
                                    <div>{msg.content}</div>
                                  )}
                                </div>
                                {msg.role === 'assistant' && (
                                  <button title="Speak reply" onClick={() => speakText(msg.content)} className="ml-2 text-sm text-neutral-500 hover:text-neutral-800">🔊</button>
                                )}
                              </div>
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="max-w-[80%] p-3 rounded-xl bg-white border border-neutral-200">
                            <div className="text-sm text-neutral-500">Thinking...</div>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask: Can I grow tomatoes in this soil?"
                        className="flex-1 px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        disabled={chatLoading}
                      />
                      <button title="Toggle voice input" onClick={toggleListening} className={`px-3 py-2 rounded-md border ${listening ? 'bg-red-600 text-white' : 'bg-white'}`}>{listening ? '🎤●' : '🎤'}</button>
                      <Button 
                        variant="primary"
                        onClick={handleSendMessage}
                        disabled={chatLoading || !userInput.trim()}
                        className="px-6"
                      >
                        {useAgent ? 'Ask Agent' : 'Send'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
