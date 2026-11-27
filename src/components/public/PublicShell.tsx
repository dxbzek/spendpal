// The frame of the public pages (home, privacy, terms): the top row on the
// green band, the footer with the legal links, and the operator details block.
import { Link } from 'react-router-dom';
import BrandMark from '@/components/BrandMark';
import { useAuth } from '@/context/AuthContext';
import { OPERATOR, OPERATOR_PENDING, contactEmail, operatorLines } from '@/lib/operator';

/** Logo and name on the left, one way in on the right. Sits inside a bg-primary band. */
export const PublicTopBar = ({ onDark = false }: { onDark?: boolean }) => {
  const { user } = useAuth();
  const ink = onDark ? 'text-foreground' : 'text-primary-foreground';
  return (
    <div className="flex items-center justify-between gap-4">
      <Link to="/" className="flex items-center gap-3 min-w-0 rounded-lg">
        {onDark ? <BrandMark className="w-8 h-8 shrink-0" /> : <BrandMark tone="mono" className={`w-8 h-8 shrink-0 ${ink}`} />}
        <span className={`text-base font-heading font-bold transition-colors ${ink}`}>SpendPal</span>
      </Link>
      {/* Someone signed in who opens the privacy page goes back to the app, not to a sign-in form. */}
      <Link
        to={user ? '/' : '/auth'}
        className={`rounded-full px-4 py-2 text-sm font-medium touch-manipulation transition-colors ${onDark ? 'bg-primary text-primary-foreground' : 'bg-primary-raised text-primary-foreground'}`}
      >
        {user ? 'Open app' : 'Sign in'}
      </Link>
    </div>
  );
};

export const PublicFooter = () => {
  const email = contactEmail(OPERATOR);
  return (
    <footer className="border-t border-border px-5 md:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
      <div className="max-w-5xl mx-auto pt-6 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BrandMark className="w-6 h-6" />
          <span className="font-medium text-foreground">SpendPal</span>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs sm:text-sm">
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">Privacy policy</Link>
          <Link to="/terms" className="text-muted-foreground hover:text-foreground">Terms of use</Link>
          {email && <a href={`mailto:${email}`} className="text-muted-foreground hover:text-foreground">Contact</a>}
        </nav>
      </div>
      <p className="max-w-5xl mx-auto mt-3 text-xs text-muted-foreground">© {new Date().getFullYear()} SpendPal · Your money, in plain words.</p>
    </footer>
  );
};

/** Who runs the service, from src/lib/operator.ts. Says so plainly while details are missing. */
export const OperatorDetails = () => {
  const { lines, incomplete } = operatorLines(OPERATOR);
  return (
    <div className="space-y-1">
      {lines.map(line => (
        <p key={line.label}>
          <span className="text-foreground font-medium">{line.label}:</span>{' '}
          {line.href ? <a href={line.href} className="text-primary font-medium break-all">{line.value}</a> : line.value}
        </p>
      ))}
      {incomplete && <p>{OPERATOR_PENDING}</p>}
    </div>
  );
};

/** Page wrapper. The app locks html/body scrolling, so a public page scrolls itself. */
export const PublicPageScroll = ({ children }: { children: React.ReactNode }) => (
  <div className="h-full overflow-y-auto bg-[hsl(252,40%,97.5%)] dark:bg-background">{children}</div>
);
