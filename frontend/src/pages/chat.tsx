import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Card, Button, Input } from '@/components/ui';

type Message = { from: 'user' | 'bot'; text: string };

export default function ChatPage() {
  const formatVisionResponse = (j: any) => {
    if (!j) return '';
    // If the backend returned a simple crop detection
    if (j.crop && !j.diagnosis) {
      return `Crop: ${j.crop} (${Math.round((j.confidence || 0) * 100)}% confidence)`;
    }
    // If the backend returned a full VisionResponse
    if (j.diagnosis || j.symptoms || j.treatment) {
      const parts: string[] = [];
      if (j.crop) parts.push(`Crop: ${j.crop} (${Math.round((j.confidence || 0) * 100)}% confidence)`);
      if (j.diagnosis) parts.push(`Diagnosis: ${j.diagnosis}`);
      if (j.symptoms && j.symptoms.length) parts.push(`Symptoms: ${j.symptoms.join(', ')}`);
      if (j.treatment) {
        const t: any = j.treatment;
        if (t.immediateActions && t.immediateActions.length) parts.push(`Immediate: ${t.immediateActions.join('; ')}`);
        if (t.organicRemedies && t.organicRemedies.length) parts.push(`Organic: ${t.organicRemedies.join('; ')}`);
        if (t.futurePrevention && t.futurePrevention.length) parts.push(`Prevention: ${t.futurePrevention.join('; ')}`);
      }
      if (j.warnings && j.warnings.length) parts.push(`Warnings: ${j.warnings.join('; ')}`);
      return parts.filter(Boolean).join('\n\n');
    }
    // Fallback: if there's a textual reply field, prefer it
    if (j.reply) return j.reply;
    // Last resort: pretty-print JSON
    try { return JSON.stringify(j, null, 2); } catch (e) { return String(j); }
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [serviceWarning, setServiceWarning] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const router = useRouter();

  useEffect(() => {
    // read any prefill from diagnostic
    try {
      const raw = sessionStorage.getItem('chat_prefill');
      if (raw) {
        const pref = JSON.parse(raw);
        // if there's an image url or base64, show preview and auto-send a vision chat
        if (pref.imageUrl || pref.imageBase64) {
          setImagePreview(pref.imageUrl || pref.imageBase64 || null);
          // compose message
          const chatMessage = (pref.transcript ? pref.transcript + '\n\n' : '') + 'Please analyze the attached image and provide diagnosis and recommended treatment steps.';
          // auto-send vision-enabled request (do not insert the helper prompt into chat history)
          (async () => {
            try {
              const payload: any = { message: chatMessage, language: 'en' };
              if (pref.imageUrl) payload.image_url = pref.imageUrl;
              else if (pref.imageBase64) payload.image_base64 = (pref.imageBase64.split(',')[1] ?? pref.imageBase64);
              const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
              const res = await fetch(`${base}/api/vision_chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
              const textResp = await res.text().catch(() => '');
              if (!res.ok) {
                if (res.status === 404) {
                  setServiceWarning('Vision service not available — using text-only fallback.');
                }
                // fallback to plain chat endpoint with image mention
                const fallbackMsg = `Image: ${pref.imageUrl ? pref.imageUrl : '[attached image]'}\n\n${chatMessage}`;
                const r2 = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: fallbackMsg }) });
                if (!r2.ok) throw new Error('fallback chat failed');
                const j2 = await r2.json();
                setMessages((s) => [...s, { from: 'bot', text: j2.reply }]);
              } else {
                // try parse json, otherwise use text
                try {
                  const j = JSON.parse(textResp || '{}');
                  const reply = (j && (j.diagnosis || j.crop || j.reply)) ? formatVisionResponse(j) : (j.reply || textResp || 'No reply');
                  setMessages((s) => [...s, { from: 'bot', text: reply }]);
                } catch (e) {
                  setMessages((s) => [...s, { from: 'bot', text: textResp || 'No reply' }]);
                }
              }
            } catch (e) {
              setServiceWarning('Chat service currently unavailable.');
              setMessages((s) => [...s, { from: 'bot', text: 'Chat service currently unavailable.' }]);
            } finally {
              try { sessionStorage.removeItem('chat_prefill'); } catch {}
            }
          })();
        }
      }
    } catch (e) {
      /* ignore */
    }
    // Setup Web Speech API if available
    const SpeechRecognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const r = new SpeechRecognition();
      r.lang = 'en-IN';
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (ev: any) => {
        const t = ev.results[0][0].transcript;
        setText((prev) => (prev ? prev + ' ' + t : t));
      };
      r.onend = () => setListening(false);
      recogRef.current = r;
    }
  }, []);

  const startListening = () => {
    if (recogRef.current) {
      try { recogRef.current.start(); setListening(true); } catch (e) { console.debug(e); }
    }
  };

  const stopListening = () => {
    if (recogRef.current) try { recogRef.current.stop(); } catch (e) { }
    setListening(false);
  };

  const send = async (msg?: string) => {
    const m = (msg ?? text).trim();
    if (!m) return;
    setMessages((s) => [...s, { from: 'user', text: m }]);
    setText('');
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      // If an image is attached and the user is asking to identify the crop,
      // call the vision-enabled chat endpoint so the model uses the image.
      const wantsIdentification = imagePreview && /\b(name|which|identify|what)\b/i.test(m) && /\b(crop|plant|this)\b/i.test(m);
      if (wantsIdentification) {
        const payload: any = { message: m, language: 'en' };
        if (imagePreview?.startsWith('data:')) payload.image_base64 = imagePreview.split(',')[1];
        else if (imagePreview) payload.image_url = imagePreview;
        const res = await fetch(`${base}/api/vision_chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const textResp = await res.text().catch(() => '');
        if (!res.ok) {
          if (res.status === 404) setServiceWarning('Vision service not available — falling back to text-only chat.');
          // attempt graceful fallback to text-only chat
          const fallbackMsg = `${payload.message}` + (payload.image_url ? `\n\nImage: ${payload.image_url}` : '');
          try {
            const r2 = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: fallbackMsg }) });
            if (!r2.ok) throw new Error('fallback failed');
            const j2 = await r2.json();
            setMessages((s) => [...s, { from: 'bot', text: j2.reply }]);
            return;
          } catch (fallbackErr) {
            throw new Error('vision chat failed and fallback failed');
          }
        }
        try {
          const j = JSON.parse(textResp || '{}');
          const reply = (j && (j.diagnosis || j.crop || j.reply)) ? formatVisionResponse(j) : (j.reply || textResp || 'No reply');
          setMessages((s) => [...s, { from: 'bot', text: reply }]);
        } catch (e) {
          setMessages((s) => [...s, { from: 'bot', text: textResp || 'No reply' }]);
        }
      } else {
        const res = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: m }) });
        if (!res.ok) throw new Error('chat failed');
        const j = await res.json();
        setMessages((s) => [...s, { from: 'bot', text: j.reply }]);
      }
    } catch (e) {
      setServiceWarning('Chat service unavailable.');
      setMessages((s) => [...s, { from: 'bot', text: 'Sorry, chat service unavailable.' }]);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Crop Health Chat</h1>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.push('/')}>Back</Button>
          </div>
        </div>

        <Card className="p-4 mb-4">
          <div className="space-y-4">
            {imagePreview && (
              <div className="mt-2">
                <div className="text-xs text-neutral-500 mb-1">Attached image from Diagnostic:</div>
                <img src={imagePreview} alt="prefill" className="w-48 h-48 object-cover rounded-lg border" />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => listening ? stopListening() : startListening()}>{listening ? 'Stop' : 'Speak'}</Button>
              <Button onClick={() => { setText(''); }}>Clear</Button>
            </div>
          </div>
        </Card>

        <div className="space-y-3 mb-6">
          {messages.map((m, i) => (
            <div key={i} className={m.from === 'user' ? 'text-right' : 'text-left'}>
              <div className={`inline-block px-4 py-2 rounded-lg ${m.from === 'user' ? 'bg-primary-600 text-white' : 'bg-white border'}`}>
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your question" />
          <Button onClick={() => send()} disabled={!text}>Send</Button>
        </div>
      </div>
    </div>
  );
}
