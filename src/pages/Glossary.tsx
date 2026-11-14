import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronDown, BookOpen, Search } from 'lucide-react';
import { FAQ, GLOSSARY, findTerm } from '@/lib/glossary';
import { PAGE_NAMES } from '@/lib/pageNames';
import { NARROW_PAGE } from '@/lib/pageLayout';

// Hoisted: defined inside the page it would remount on every keystroke.
const Row = ({ title, body, open, onToggle }: { title: string; body: string; open: boolean; onToggle: () => void }) => (
  <div className="bg-card rounded-xl card-shadow overflow-hidden">
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="w-full min-h-[44px] flex items-center justify-between gap-3 px-4 py-3.5 text-left"
    >
      <span className="text-sm font-heading">{title}</span>
      <m.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
        <ChevronDown size={16} className="text-muted-foreground" />
      </m.div>
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">{body}</p>
        </m.div>
      )}
    </AnimatePresence>
  </div>
);

const Glossary = () => {
  const [params] = useSearchParams();
  // A "?" link names its term: open that entry and scroll to it, instead of
  // leaving the reader at the top of the list.
  const linked = GLOSSARY[findTerm(GLOSSARY, params.get('term'))]?.term ?? null;
  const [openTerm, setOpenTerm] = useState<string | null>(linked);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const linkedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    linkedRef.current?.scrollIntoView?.({ block: 'center' });
  }, []);

  const q = search.toLowerCase().trim();
  const terms = useMemo(
    () => (q ? GLOSSARY.filter(e => e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q)) : GLOSSARY),
    [q],
  );
  const questions = useMemo(
    () => (q ? FAQ.filter(f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)) : FAQ),
    [q],
  );


  return (
    <div className="animate-fade-in pb-8">
      <div className="bg-primary px-5 md:px-8 pt-12 pb-8 rounded-b-2xl md:rounded-b-none mb-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <BookOpen size={24} className="text-primary-foreground" />
            <h1 className="text-xl text-primary-foreground font-heading">{PAGE_NAMES['/glossary']}</h1>
          </div>
          <p className="text-primary-subtle text-sm mt-2">What the words on SpendPal's screens mean</p>
          <div className="relative mt-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-subtle" />
            <input
              type="search"
              aria-label="Search the glossary and questions"
              placeholder="Search…"
              value={search}
              onChange={e => { setSearch(e.target.value); setOpenTerm(null); setOpenQuestion(null); }}
              className="w-full h-11 pl-9 pr-3 rounded-xl text-sm bg-primary-raised text-primary-foreground placeholder:text-primary-subtle border border-primary-edge outline-none focus:border-primary-edge"
            />
          </div>
        </div>
      </div>

      <div className={`${NARROW_PAGE} space-y-6`}>
        {terms.length === 0 && questions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nothing matches "{search}"</p>
        )}

        {terms.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Glossary</h2>
            {terms.map(e => (
              <div key={e.term} ref={e.term === linked ? linkedRef : undefined}>
                <Row
                  title={e.term}
                  body={e.definition}
                  open={openTerm === e.term}
                  onToggle={() => setOpenTerm(prev => (prev === e.term ? null : e.term))}
                />
              </div>
            ))}
          </section>
        )}

        {questions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Questions</h2>
            {questions.map(f => (
              <Row
                key={f.question}
                title={f.question}
                body={f.answer}
                open={openQuestion === f.question}
                onToggle={() => setOpenQuestion(prev => (prev === f.question ? null : f.question))}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default Glossary;
