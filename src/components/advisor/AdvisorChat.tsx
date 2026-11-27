// The AI Advisor chat (2026-11-27): ask anything about your money. The server
// reads your records and keeps lasting facts ("memory"); the conversation
// itself stays on this device, per account, so it survives a reload.
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Brain, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { invokeWithTimeout } from '@/hooks/useAI';
import { useCurrency } from '@/context/CurrencyContext';
import { useAuth } from '@/context/AuthContext';

type Turn = { role: 'user' | 'assistant'; content: string };
type Trial = { pro: boolean; active: boolean; endsAt: string | null };

/** Shown one after another while the assistant works, like a loading line. */
export const THINKING_WORDS = [
  'Counting coins', 'Crunching numbers', 'Balancing the books', 'Chasing receipts',
  'Pinching pennies', 'Following the money', 'Tallying it up', 'Checking the card bill',
  'Reconciling', 'Doing the maths',
];

const STARTERS = [
  'Break down my spending this month',
  'What happened on my credit card?',
  'Can I afford a 500 purchase this week?',
  'How fast can I clear my card?',
];

const storeKey = (id: string) => `advisor-chat-v1:${id}`;

const Thinking = () => {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(v => (v + 1) % THINKING_WORDS.length), 1200); return () => clearInterval(t); }, []);
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
      <span>{THINKING_WORDS[i]}…</span>
      <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse" aria-hidden />
    </div>
  );
};

/** Plain text with **bold** and "- " bullet lines; nothing else is rendered as markup. */
const Rich = ({ text }: { text: string }) => (
  <div className="space-y-1.5">
    {text.split('\n').filter(l => l.trim()).map((line, k) => {
      const bullet = /^\s*[-•*]\s+/.test(line);
      const body = line.replace(/^\s*[-•*]\s+/, '').replace(/^#+\s*/, '');
      const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
        p.startsWith('**') && p.endsWith('**') ? <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>);
      return bullet
        ? <div key={k} className="flex gap-2"><span className="text-primary">•</span><span>{parts}</span></div>
        : <p key={k}>{parts}</p>;
    })}
  </div>
);

const AdvisorChat = () => {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [facts, setFacts] = useState<string[]>([]);
  const [showMemory, setShowMemory] = useState(false);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [joined, setJoined] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    try { setTurns(JSON.parse(localStorage.getItem(storeKey(user.id)) ?? '[]')); } catch { setTurns([]); }
    invokeWithTimeout<{ facts?: string[] }>('ai-finance', { type: 'memory' }, 15_000)
      .then(r => setFacts(r.facts ?? [])).catch(() => {});
    invokeWithTimeout<Trial>('ai-finance', { type: 'trial' }, 15_000).then(setTrial).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (user) localStorage.setItem(storeKey(user.id), JSON.stringify(turns.slice(-40)));
    // Scroll only the message list. scrollIntoView also scrolled the whole page until the last
    // reply touched the bottom edge, which left the input box behind the floating nav bar.
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns, user]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(next); setInput(''); setBusy(true);
    try {
      const r = await invokeWithTimeout<{ result?: string; memory?: string[]; remembered?: string[] }>(
        'ai-finance', { type: 'chat', data: { messages: next.slice(-30) }, currency }, 60_000);
      setTurns([...next, { role: 'assistant', content: r.result || 'I could not answer that one. Try asking another way.' }]);
      if (r.memory) setFacts(r.memory);
      if (r.remembered?.length) toast.success('Saved to memory', { description: r.remembered.join(' · ') });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The assistant is unavailable right now.';
      if (/trial has ended/i.test(msg)) setTrial(t => (t ? { ...t, active: false } : { pro: false, active: false, endsAt: null }));
      toast.error(msg);
      setTurns(next);
    } finally {
      setBusy(false);
    }
  };

  const forget = async (fact: string) => {
    const left = facts.filter(f => f !== fact);
    setFacts(left);
    try { await invokeWithTimeout('ai-finance', { type: 'memory', data: { facts: left } }, 15_000); }
    catch { toast.error('Could not update memory'); }
  };

  return (
    <section aria-label="Ask your money assistant" className="rounded-2xl bg-card card-shadow overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="text-base font-semibold">Ask SpendPal</h2>
          <p className="text-xs text-muted-foreground">Reads your accounts, budgets, goals and plans.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setShowMemory(v => !v)} className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs bg-muted hover:bg-accent" aria-expanded={showMemory}>
            <Brain size={14} /> Memory {facts.length ? `· ${facts.length}` : ''}
          </button>
          {turns.length > 0 && (
            <button type="button" onClick={() => setTurns([])} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Clear chat" title="Clear chat">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {trial && !trial.pro && trial.active && trial.endsAt && (
        <p className="mx-4 mt-3 rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
          Free trial: {Math.max(1, Math.ceil((new Date(trial.endsAt).getTime() - Date.now()) / 3_600_000))} hours left
        </p>
      )}

      {showMemory && (
        <div className="mx-4 mt-3 rounded-xl bg-muted p-3 text-sm">
          {facts.length === 0
            ? <p className="text-muted-foreground">Nothing saved yet. Tell the assistant things like your payday and it will remember.</p>
            : <ul className="space-y-1.5">{facts.map(f => (
                <li key={f} className="flex items-start justify-between gap-2">
                  <span>{f}</span>
                  <button type="button" onClick={() => forget(f)} aria-label={`Forget: ${f}`} className="shrink-0 text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </li>))}</ul>}
        </div>
      )}

      <div ref={listRef} className="px-4 py-4 space-y-3 max-h-[50dvh] overflow-y-auto overscroll-contain">
        {turns.length === 0 && !busy && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map(s => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted">{s}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex'}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${t.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
              {t.role === 'assistant' ? <Rich text={t.content} /> : t.content}
            </div>
          </div>
        ))}
        {busy && <Thinking />}
      </div>

      {trial && !trial.active ? (
        <div className="border-t border-border p-4 text-center">
          <p className="text-sm font-semibold">Your 24-hour free trial has ended</p>
          <p className="mt-1 text-xs text-muted-foreground">Pro keeps the assistant, its memory and the budget analysis.</p>
          <button type="button" disabled={joined}
            onClick={async () => {
              try { await invokeWithTimeout('ai-finance', { type: 'waitlist' }, 15_000); setJoined(true); toast.success('You are on the list. We will tell you when Pro opens.'); }
              catch { toast.error('Could not save that. Try again.'); }
            }}
            className="mt-3 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {joined ? 'You are on the list' : 'Get Pro'}
          </button>
        </div>
      ) : (
      <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          rows={1}
          placeholder="Ask about your money…"
          aria-label="Ask about your money"
          className="flex-1 resize-none rounded-xl bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring max-h-32"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
          <ArrowUp size={18} />
        </button>
      </form>
      )}
    </section>
  );
};

export default AdvisorChat;
