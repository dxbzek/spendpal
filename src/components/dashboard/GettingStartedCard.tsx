import { CheckCircle2, ChevronRight, PiggyBank, Receipt, Target, Wallet, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ChecklistStep, ChecklistStepId } from '@/lib/onboarding';

const ICONS: Record<ChecklistStepId, LucideIcon> = {
  account: Wallet,
  transaction: Receipt,
  budget: PiggyBank,
  goal: Target,
};

interface Props {
  steps: ChecklistStep[];
  onStep: (id: ChecklistStepId) => void;
  onDismiss: () => void;
}

/**
 * The getting-started list, kept at the top of Home after the first account.
 * It used to vanish the moment that account was saved, leaving a mostly empty
 * Home and nothing pointing at the next step. Each step not done yet is a
 * button that opens the form for it.
 */
const GettingStartedCard = ({ steps, onStep, onDismiss }: Props) => {
  const done = steps.filter(s => s.done).length;
  return (
    <section aria-labelledby="getting-started" className="bg-card rounded-xl p-4 card-shadow mb-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h2 id="getting-started" className="font-heading text-sm">Getting started</h2>
          <p className="text-xs text-muted-foreground">{done} of {steps.length} done</p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Hide getting started"
          className="w-10 h-10 -mr-2 -mt-2 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
        >
          <X size={16} />
        </button>
      </div>
      <ul className="space-y-1">
        {steps.map(step => {
          const Icon = ICONS[step.id];
          const body = (
            <>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${step.done ? 'bg-income-soft' : 'bg-accent'}`}>
                {step.done ? <CheckCircle2 size={18} className="text-income" /> : <Icon size={17} className="text-primary" />}
              </span>
              <span className="flex-1 min-w-0 text-left">
                <span className={`block text-sm font-medium ${step.done ? 'line-through text-muted-foreground' : ''}`}>{step.label}</span>
                <span className="block text-xs text-muted-foreground">{step.hint}</span>
              </span>
            </>
          );
          return (
            <li key={step.id}>
              {step.done ? (
                <div className="flex items-center gap-3 p-2 min-h-[48px]">
                  {body}
                  <span className="sr-only">Done</span>
                </div>
              ) : (
                <button
                  onClick={() => onStep(step.id)}
                  className="w-full flex items-center gap-3 p-2 min-h-[48px] rounded-lg hover:bg-muted transition-colors"
                >
                  {body}
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default GettingStartedCard;
