// Shared layout of the Privacy and Terms pages: green band with the title and
// the date of the last change, then one card per section.
import { LEGAL_LAST_CHANGED } from '@/lib/publicSite';
import { usePageHead } from '@/hooks/usePageHead';
import { PublicFooter, PublicPageScroll, PublicTopBar } from '@/components/public/PublicShell';

export const LegalLayout = ({ path, title, intro, children }: {
  path: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) => {
  usePageHead(path);
  return (
    <PublicPageScroll>
      <header className="bg-primary px-5 md:px-8 pt-10 pb-10 rounded-b-2xl md:rounded-b-none">
        <div className="max-w-2xl mx-auto">
          <PublicTopBar />
          <h1 className="text-2xl md:text-3xl font-heading text-primary-foreground mt-8">{title}</h1>
          <p className="text-sm text-primary-subtle mt-2">Last changed {LEGAL_LAST_CHANGED}</p>
          <p className="text-sm text-primary-foreground mt-4 leading-relaxed">{intro}</p>
        </div>
      </header>
      <main className="px-5 md:px-8 -mt-4 pb-12">
        <div className="max-w-2xl mx-auto space-y-4">{children}</div>
      </main>
      <PublicFooter />
    </PublicPageScroll>
  );
};

export const LegalSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="bg-card rounded-xl p-5 card-shadow">
    <h2 className="text-base font-semibold mb-3">{title}</h2>
    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed [&_strong]:text-foreground [&_strong]:font-medium">
      {children}
    </div>
  </section>
);

/** A plain bullet list in the section's text style. */
export const LegalList = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="list-disc pl-5 space-y-1.5">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);
