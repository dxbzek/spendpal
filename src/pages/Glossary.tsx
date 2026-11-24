import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';
import { FAQ, GLOSSARY, findTerm } from '@/lib/glossary';
import { PAGE_NAMES } from '@/lib/pageNames';
import { NARROW_PAGE } from '@/lib/pageLayout';
import { PageHeader, SectionLabel } from '@/components/orbix';

// One row of an accordion card. Rows share one dark card, split by hairlines.
// Hoisted: defined inside the page it would remount on every keystroke.
const Row = ({ title, body, open, onToggle }: { title: string; body: string; open: boolean; onToggle: () => void }) => (
  <div>
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="w-full min-h-[52px] flex items-center justify-between gap-3 py-3.5 text-left"
    >
      <span className={`text-[15px] font-medium transition-colors ${open ? 'text-primary' : ''}`}>{title}</span>
      <m.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${open ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        <ChevronDown size={14} />
      </m.span>
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
          <p className="pb-4 pr-10 text-sm text-muted-foreground leading-relaxed">{body}</p>
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
    <div className={`${NARROW_PAGE} animate-fade-in pb-8`}>
      <PageHeader title={PAGE_NAMES['/glossary']} subtitle="What the words on SpendPal's screens mean" />

      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search the glossary and questions"
          placeholder="Search…"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpenTerm(null); setOpenQuestion(null); }}
          className="w-full h-12 pl-11 pr-4 rounded-full text-sm bg-card text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-7">
        {terms.length === 0 && questions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nothing matches "{search}"</p>
        )}

        {terms.length > 0 && (
          <section>
            <SectionLabel label="Glossary" count={terms.length} />
            <div className="bg-card rounded-3xl px-4 divide-y divide-border">
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
            </div>
          </section>
        )}

        {questions.length > 0 && (
          <section>
            <SectionLabel label="Questions" count={questions.length} />
            <div className="bg-card rounded-3xl px-4 divide-y divide-border">
              {questions.map(f => (
                <Row
                  key={f.question}
                  title={f.question}
                  body={f.answer}
                  open={openQuestion === f.question}
                  onToggle={() => setOpenQuestion(prev => (prev === f.question ? null : f.question))}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Glossary;
