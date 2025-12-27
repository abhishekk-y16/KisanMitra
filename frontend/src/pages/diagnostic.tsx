import React, { useState, useEffect, useRef } from 'react';
import { DiagnosticModal as DiagnosticComponent } from '@/components/DiagnosticModal';
import Card, { CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import ReactMarkdown from 'react-markdown';
import { getApiUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

function DiagnosticChat({ initialMessage }: { initialMessage?: string }) {
  const { t, lang } = useI18n();
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'assistant'; content: string}[]>([]);
  const [userInput, setUserInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const _prevChatLen = useRef(0);
  useEffect(() => {
    if (chatHistory.length > _prevChatLen.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    _prevChatLen.current = chatHistory.length;
  }, [chatHistory]);

  // Seed chat with an initial assistant message when available
  useEffect(() => {
    if (initialMessage && initialMessage.trim()) {
      setChatHistory(prev => {
        // avoid duplicating if already seeded
        if (prev.length > 0 && prev[0].content === initialMessage) return prev;
        return [...prev, { role: 'assistant', content: initialMessage }];
      });
    }
  }, [initialMessage]);

  const handleSend = async () => {
    if (!userInput.trim()) return;
    const newMsg = { role: 'user' as const, content: userInput };
    setChatHistory(prev => [...prev, newMsg]);
    setUserInput('');
    setChatLoading(true);
    try {
      // Use the soil-report chat endpoint (normal chatbot) instead of the pydantic agent
      // Attempt to extract a crop hint from the seeded initialMessage or recent chat history
      const extractCropHint = (text?: string) => {
        if (!text) return null;
        const COMMON = ['rice','wheat','maize','corn','tomato','cotton','okra','eggplant','brinjal','chilli','chiles','potato','banana','soybean'];
        const txt = text.toLowerCase();
        for (const c of COMMON) if (txt.indexOf(c) !== -1) return c;
        const m = text.match(/(?:crop is|this is|it is|it's)\s+([A-Za-z\- ]{3,30})/i);
        if (m) return m[1].split(/\s+/)[0].toLowerCase();
        return null;
      };

      let crop_hint = extractCropHint(initialMessage || '');
      if (!crop_hint) {
        for (let i = chatHistory.length - 1; i >= 0 && i >= chatHistory.length - 5; i--) {
          const entry = chatHistory[i];
          if (entry && entry.role === 'user') {
            const h = extractCropHint(entry.content);
            if (h) { crop_hint = h; break; }
          }
        }
      }

      const apiBase = getApiUrl();
      const res = await fetch(`${apiBase}/api/diagnostic/chat`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ image_base64: null, image_url: null, message: newMsg.content, chat_history: chatHistory, crop_hint })
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setChatHistory(data.updated_history);
      } else {
        const pretty = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        setChatHistory(prev => [...prev, { role: 'assistant', content: pretty }]);
      }
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || String(e)}` }]);
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
    } catch (e) {
      // ignore
    }
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
    return () => {
      try { r.onresult = null; r.onend = null; r.onerror = null; } catch(e){}
    };
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto mb-4 space-y-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-xl ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-neutral-200'}`}>
              <div className="text-sm whitespace-pre-wrap flex items-start gap-2">
                <div className="flex-1">
                  {msg.role === 'assistant' ? <ReactMarkdown>{msg.content}</ReactMarkdown> : <div>{msg.content}</div>}
                </div>
                {msg.role === 'assistant' && (
                  <button title="Speak reply" onClick={() => speakText(msg.content)} className="ml-2 text-sm text-neutral-500 hover:text-neutral-800">🔊</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {chatLoading && (
          <div className="flex justify-start"><div className="max-w-[80%] p-3 rounded-xl bg-white border border-neutral-200"><div className="text-sm text-neutral-500">Thinking...</div></div></div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="flex gap-2">
        <input className="flex-1 px-4 py-3 border border-neutral-300 rounded-xl" value={userInput} onChange={(e)=>setUserInput(e.target.value)} onKeyPress={(e)=>e.key==='Enter'&&handleSend()} disabled={chatLoading} placeholder={t('askPlaceholder')} />
        <button title="Toggle voice input" onClick={toggleListening} className={`px-3 py-2 rounded-md border ${listening ? 'bg-red-600 text-white' : 'bg-white'}`}>{listening ? '🎤●' : '🎤'}</button>
        <Button variant="primary" onClick={handleSend} disabled={chatLoading || !userInput.trim()}>Ask</Button>
      </div>
    </div>
  );
}

function HistoryPanel({ recent }: { recent: {id:number;crop:string;date:string;result:string;confidence:number}[] }) {
  return (
    <div>
      {recent.map(r => (
        <div key={r.id} className="p-3 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{r.crop}</div>
              <div className="text-xs text-neutral-500">{r.result} • {r.date}</div>
            </div>
            <div className="text-sm font-bold text-neutral-800">{Math.round(r.confidence*100)}%</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabsArea({ initialPrefill }: { initialPrefill?: string | null }) {
  const [tab, setTab] = useState<'chat'|'history'|'tips'>('chat');
  return (
    <div className="flex flex-col h-[640px]">
      <div className="flex gap-2 mb-3">
        <button className={`px-3 py-1 rounded ${tab==='chat'?'bg-indigo-600 text-white':'bg-white border'}`} onClick={()=>setTab('chat')}>Chat</button>
        <button className={`px-3 py-1 rounded ${tab==='history'?'bg-indigo-600 text-white':'bg-white border'}`} onClick={()=>setTab('history')}>History</button>
        <button className={`px-3 py-1 rounded ${tab==='tips'?'bg-indigo-600 text-white':'bg-white border'}`} onClick={()=>setTab('tips')}>Tips</button>
      </div>
      <div className="flex-1 overflow-auto">
        {tab==='chat' && <div className="h-full"><DiagnosticChat initialMessage={initialPrefill ?? undefined} /></div>}
        {tab==='history' && <HistoryPanel recent={[
          { id: 1, crop: 'Tomato', date: '2025-12-18', result: 'Bacterial spot', confidence: 0.82 },
          { id: 2, crop: 'Wheat', date: '2025-12-14', result: 'Rust (early)', confidence: 0.73 },
        ]} />}
        {tab==='tips' && (
          <div className="p-3 text-sm text-neutral-700">
            <h4 className="font-semibold mb-2">Photo Tips</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Clear focus on affected area</li>
              <li>Use natural light, avoid shadows</li>
              <li>Plain background and multiple angles</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiagnosticPage() {
  const recent = [
    { id: 1, crop: 'Tomato', date: '2025-12-18', result: 'Bacterial spot', confidence: 0.82 },
    { id: 2, crop: 'Wheat', date: '2025-12-14', result: 'Rust (early)', confidence: 0.73 },
  ];
  const [diagnosticPrefill, setDiagnosticPrefill] = useState<string | null>(null);

  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 py-10">
      <div className="max-w-[1800px] mx-auto px-6 sm:px-10 lg:px-12">
        
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-2">
                🔬 {t('cropDiagnostics')}
              </h1>
              <p className="text-sm sm:text-base text-neutral-600 max-w-2xl">
                {t('uploadDiagnose')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => window.open('/weather', '_self')}>
                Weather
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open('/market', '_self')}>
                Market
              </Button>
              <Button size="sm" onClick={() => window.location.reload()}>
                🔄 Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Diagnostic + Recent */}
          <section className="lg:col-span-8 space-y-8">
            <Card variant="elevated" className="bg-white/95 backdrop-blur-sm">
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-900">{t('uploadDiagnose')}</h2>
                    <p className="text-sm text-neutral-600">Take a clear photo of the affected leaf or plant part for accurate AI analysis</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>{t('refresh')}</Button>
                  </div>
                </div>

                <div className="bg-neutral-50 rounded-xl p-4 border-2 border-dashed border-neutral-300">
                  <DiagnosticComponent inline onDiagnose={(r:any) => {
                    const summary = `Detected: ${r.diagnosis || 'Unknown'} (${Math.round((r.confidence||0)*100)}%)\nSuggested: ${typeof r.treatment === 'string' ? r.treatment : (r.treatment?.immediateActions?.slice(0,2).join('; ') || 'See details')}`;
                    setDiagnosticPrefill(summary);
                  }} />
                </div>

                {/* Square diagnosis preview */}
                {diagnosticPrefill && (
                  <div className="mt-6 flex justify-center">
                    <div className="w-full max-w-sm aspect-square bg-white border border-neutral-200 rounded-xl shadow-md p-4 flex flex-col">
                      <div className="text-sm text-neutral-500 mb-2">{t('diagnosisSummary')}</div>
                      <pre className="flex-1 text-sm whitespace-pre-wrap break-words text-neutral-800">{diagnosticPrefill}</pre>
                      <div className="text-xs text-neutral-500 mt-3">Use this summary to ask follow-up questions in the {t('diagnosticAssistant')}.</div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">📋 {t('recentScans')}</h3>
                  <div className="text-sm text-neutral-500">Quick history</div>
                </div>
                <div className="space-y-3">
                  {recent.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-neutral-50 border border-neutral-200 rounded-lg hover:shadow-md transition">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🌱</span>
                        <div>
                          <h4 className="font-semibold text-neutral-900">{item.crop}</h4>
                          <p className="text-sm text-neutral-600">{item.result} • <span className="text-xs text-neutral-500">{item.date}</span></p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-neutral-700">Confidence</div>
                        <div className={`text-2xl font-bold ${item.confidence >= 0.8 ? 'text-green-600' : item.confidence >= 0.6 ? 'text-yellow-600' : 'text-orange-600'}`}>{Math.round(item.confidence * 100)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </section>

          {/* Right: Chat / Tips (Tabbed) */}
          <aside className="lg:col-span-4">
            <Card className="mb-4">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">Diagnostic Assistant</h3>
                  <div className="text-xs text-neutral-500">Ask about diagnosis, treatment and next steps</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => window.open('/help', '_self')}>Help</Button>
                </div>
              </div>
            </Card>

            <Card variant="elevated" className="bg-white/95 mb-4">
              <div className="p-4">
                <TabsArea initialPrefill={diagnosticPrefill} />
              </div>
            </Card>

            <Card variant="elevated" className="bg-gradient-to-br from-primary-50 to-primary-100 border-2 border-primary-200">
              <div className="p-4">
                <h4 className="text-sm font-semibold text-primary-900">📊 System Stats</h4>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold">50+</div>
                    <div className="text-xs text-primary-600">Diseases</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">85%</div>
                    <div className="text-xs text-primary-600">Avg Accuracy</div>
                  </div>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
