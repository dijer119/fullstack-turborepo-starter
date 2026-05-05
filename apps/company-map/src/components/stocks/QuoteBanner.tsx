import quotesData from "@/data/investment_quotes.json" with { type: "json" };
import type { InvestmentQuote } from "@/types/stocks";

const quotes = (quotesData as { quotes: InvestmentQuote[] }).quotes;

function pickQuote(): InvestmentQuote | null {
  if (!quotes.length) return null;
  return quotes[Math.floor(Math.random() * quotes.length)];
}

export function QuoteBanner() {
  const q = pickQuote();
  if (!q) return null;
  return (
    <blockquote className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 text-sm text-gray-700 dark:border-gray-800 dark:from-gray-900 dark:to-gray-950 dark:text-gray-300">
      <p className="font-medium">&ldquo;{q.quote}&rdquo;</p>
      <footer className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>
          — {q.author}
          {q.source ? `, ${q.source}` : ""}
        </span>
        {q.original ? (
          <span className="italic opacity-70">&ldquo;{q.original}&rdquo;</span>
        ) : null}
      </footer>
    </blockquote>
  );
}
