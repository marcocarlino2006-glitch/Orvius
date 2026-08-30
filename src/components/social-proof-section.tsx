const quotes = [
  {
    text: "I get the lead on my phone before I finish the job I'm on. After-hours AC calls don't wait in voicemail anymore.",
    name: "Summit HVAC",
    role: "Design partner · Austin, TX",
  },
  {
    text: "One missed emergency call costs more than a month of service. Orvius exists so that call never hits voicemail.",
    name: "Built for owner-operators",
    role: "2–15 trucks · HVAC, plumbing, electrical",
  },
] as const;

export function SocialProofSection() {
  return (
    <section className="cursor-proof" aria-label="Customer proof">
      <div className="editorial-wrap">
        <p className="cursor-trust-kicker font-sans">
          Trusted by shops that can&apos;t afford to miss a call
        </p>
        <div className="cursor-quotes">
          {quotes.map((quote) => (
            <blockquote key={quote.name} className="cursor-quote">
              <p className="cursor-quote-text font-sans">&ldquo;{quote.text}&rdquo;</p>
              <footer className="cursor-quote-by font-sans">
                <cite>{quote.name}</cite>
                <span>{quote.role}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
