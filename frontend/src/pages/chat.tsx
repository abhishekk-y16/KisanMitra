import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Card, Button, Input } from '@/components/ui';

type Message = { from: 'user' | 'bot'; text: string };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const router = useRouter();

  useEffect(() => {
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: m }),
      });
      if (!res.ok) throw new Error('chat failed');
      const j = await res.json();
      setMessages((s) => [...s, { from: 'bot', text: j.reply }]);
    } catch (e) {
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
            <p className="text-sm text-neutral-600">Ask about crop health, pests, market prices, or weather. You can type or speak — we'll convert voice to text.</p>
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
