// The terms of use. Short on purpose: only what the service can stand behind.
// Change LEGAL_LAST_CHANGED with any edit.
import { Link } from 'react-router-dom';
import { LegalLayout, LegalList, LegalSection } from '@/components/public/LegalLayout';
import { OperatorDetails } from '@/components/public/PublicShell';
import { GOVERNING_LAW_PENDING, OPERATOR, governingLawLine } from '@/lib/operator';

const Terms = () => {
  const law = governingLawLine(OPERATOR);
  return (
    <LegalLayout
      path="/terms"
      title="Terms of use"
      intro="By creating an account or using SpendPal you agree to these terms. They are short, so please read them."
    >
      <LegalSection title="Who runs SpendPal">
        <OperatorDetails />
      </LegalSection>

      <LegalSection title="What SpendPal is">
        <p>
          SpendPal is a personal finance tracker. You keep your accounts, cards, transactions, budgets, instalment plans and savings goals
          in it, and it adds them up for you. It does not connect to your bank, move money or make payments.
        </p>
      </LegalSection>

      <LegalSection title="Your figures">
        <p>
          Every figure SpendPal shows is worked out from what you type in or import. If a record is missing or wrong, the totals,
          budgets and projections built on it are wrong too. Check imported rows before you save them.
        </p>
        <p>
          <strong>SpendPal is not financial advice.</strong> Check important numbers, such as what a card statement asks you to pay,
          against your bank before you act on them.
        </p>
      </LegalSection>

      <LegalSection title="The AI features">
        <p>
          The AI Advisor, budget suggestions and statement and screenshot import use an AI model. It can be wrong: it can
          misread a statement, miss a transaction or suggest something that does not suit you. Treat what it says as a suggestion,
          not advice. The <Link to="/privacy" className="text-primary font-medium">Privacy policy</Link> says what each feature sends.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <LegalList items={[
          'Keep your password to yourself. You are responsible for what is done with your account.',
          'Your records stay yours. You can export them or delete them at any time in Settings.',
        ]} />
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>Do not:</p>
        <LegalList items={[
          "use SpendPal for anything unlawful, or to store someone else's financial records without their permission",
          "try to read or change another person's data, or get around the sign-in or the daily AI limit",
          'overload the service or attack it, or use automated tools to make heavy use of it',
        ]} />
        <p>An account that breaks these terms can be suspended or closed.</p>
      </LegalSection>

      <LegalSection title="Changes and availability">
        <p>
          SpendPal can change, add or remove features, and can stop. It is provided as it is, with no promise that it will always be
          available or free of errors. Keep your own export if a record matters to you. When these terms change, the date at the top changes too.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>{law ?? GOVERNING_LAW_PENDING}</p>
      </LegalSection>
    </LegalLayout>
  );
};

export default Terms;
