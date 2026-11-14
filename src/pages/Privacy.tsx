// The privacy policy. Every line here is written from what the code does:
// change it when the code changes (and update LEGAL_LAST_CHANGED).
import { Link } from 'react-router-dom';
import { LegalLayout, LegalList, LegalSection } from '@/components/public/LegalLayout';
import { OperatorDetails } from '@/components/public/PublicShell';

const Privacy = () => (
  <LegalLayout
    path="/privacy"
    title="Privacy policy"
    intro="What SpendPal stores about you, who processes it, what is never done with it, and how to take it out or delete it."
  >
    <LegalSection title="Who runs SpendPal">
      <OperatorDetails />
    </LegalSection>

    <LegalSection title="What is stored">
      <LegalList items={[
        <><strong>Your sign-in.</strong> Your email address and your password. The password is kept by the sign-in service in a form that cannot be read back.</>,
        <><strong>Your financial records.</strong> Everything you type in or import: accounts and cards (names, balances, limits, statement and due days, statement amounts), transactions (amount, date, merchant, category, note), budgets, savings goals, instalment plans and your own categories.</>,
        <><strong>Your profile.</strong> Your display name, your currency, and a profile photo if you add one.</>,
        <><strong>Your saved settings.</strong> Monthly income, payday, net worth goal and month-end net worth, budget templates,
          which budgets roll over, a second currency, and whether you finished or hid the first-use steps.</>,
        <><strong>AI advisor results.</strong> Each budget analysis you run is saved so you can open it again. You can delete them on the AI Advisor page.</>,
        <><strong>A count of your AI uses</strong> per day, to apply the daily limit.</>,
      ]} />
      <p>
        <strong>Your profile photo is public to anyone who has its link.</strong> It is kept in a storage folder that serves files
        without sign-in, so the app can show it. Do not use a photo you would not want others to see.
      </p>
    </LegalSection>

    <LegalSection title="Where it is processed">
      <LegalList items={[
        <><strong>Supabase</strong> holds the database and runs sign-in, file storage and the server functions. Row level security means
          each account can read and change only its own rows.</>,
        <><strong>Vercel</strong> hosts the app's files. Like any web host it sees your IP address and which pages your browser loads.
          Your financial records go from your browser to Supabase, not through Vercel.</>,
        <><strong>Anthropic</strong> runs the AI model behind the AI features. Nothing is sent to it unless you use one of them. See the next section for exactly what is sent.</>,
        <><strong>Sentry</strong> receives error reports when error reporting is switched on. A report holds the error message, where in the
          code it happened, the page address and your browser and device type. Before a report leaves your browser, numbers are taken out
          of the notes attached to it so amounts do not go with it. The error message itself is sent as it is.</>,
        <><strong>open.er-api.com</strong> supplies exchange rates. Your browser asks it for the rates of your currency. It receives the currency
          code and your IP address, never an amount.</>,
      ]} />
    </LegalSection>

    <LegalSection title="What the AI features send">
      <p>Each AI feature runs only when you start it, and sends only what it needs, through SpendPal's server function to Anthropic:</p>
      <LegalList items={[
        <><strong>Import a statement:</strong> the text of the file you pick. A PDF or Excel file is read in your browser first, and its text is sent.</>,
        <><strong>Import or scan a screenshot:</strong> the image you pick, and the note you type with it, if any.</>,
        <><strong>AI Advisor:</strong> this month's income, spending and spending by category, your spendable cash, your recurring
          payments (merchant and amount), your cards (name, amount owed, limit, minimum due), your budgets, your goals (name, target, saved), how many accounts and transactions you have, and your currency.</>,
        <><strong>Budget suggestions</strong> on the Budgets page: the category, amount and date of each of your expenses.</>,
      ]} />
      <p>
        The answer comes back to your browser. Each account can make up to 30 AI requests a day (3 a day for an account that is less than a day old or has not confirmed its email). Anthropic's own terms
        cover how it handles what it receives.
      </p>
    </LegalSection>

    <LegalSection title="What is not done">
      <LegalList items={[
        'There are no ads.',
        'Your data is not sold or shared for marketing.',
        'SpendPal does not connect to your bank. Everything in it is what you type in or upload.',
      ]} />
    </LegalSection>

    <LegalSection title="Cookies and storage on your device">
      <p>SpendPal sets no cookies. It uses your browser's local storage for:</p>
      <LegalList items={[
        'your sign-in session, so you stay signed in',
        'choices for this device: light or dark mode, and whether balances are hidden',
        'a copy of your saved settings, so they still work when the server cannot be reached',
        'exchange rates, so they are not fetched on every visit',
        'which budget alerts were already shown',
      ]} />
      <p>The app's files are also kept by your browser so it opens quickly and can be installed on a phone.</p>
    </LegalSection>

    <LegalSection title="Export and delete">
      <LegalList items={[
        <><strong>Export.</strong> In Settings, under Data, <strong>Export</strong> downloads your accounts, transactions, budgets and goals
          as a JSON file. Your own categories and saved settings are not in it.</>,
        <><strong>Delete your records.</strong> In Settings, under Danger Zone, <strong>Delete All Transactions</strong> removes your transactions
          and <strong>Delete Everything</strong> removes all your records, your saved settings and your profile photo but keeps your sign-in.
          If the photo cannot be removed, you are told.</>,
        <><strong>Delete your account.</strong> In Settings, under Danger Zone, <strong>Delete my account</strong> removes your sign-in and
          everything stored with it, including your photo.</>,
      ]} />
      <p>
        Deleting removes the data from the live database straight away. If the database host keeps backups, a copy can stay in them
        until those backups expire. Delete Everything also clears this account's copy on this device, except the hidden-balances choice;
        light or dark mode stays until you clear your browser's data for this site.
      </p>
    </LegalSection>

    <LegalSection title="Questions and changes">
      <p>
        For a question about your data, or to ask for a copy or a deletion you cannot do in the app, use the contact details at the
        top of this page. When this policy changes, the date at the top changes too.
      </p>
      <p>
        See also the <Link to="/terms" className="text-primary font-medium">Terms of use</Link>.
      </p>
    </LegalSection>
  </LegalLayout>
);

export default Privacy;
