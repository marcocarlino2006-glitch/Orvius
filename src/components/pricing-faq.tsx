"use client";

import { useState } from "react";
import { pricingFaq } from "@/lib/pricing-faq";

export function PricingFAQ() {
  const [openId, setOpenId] = useState<string | null>(pricingFaq[0]?.id ?? null);

  return (
    <section className="pricing-faq" aria-label="Pricing FAQ">
      <div className="pricing-faq-head font-sans">
        <p className="pricing-faq-kicker type-eyebrow">FAQ</p>
        <h2 className="pricing-faq-title type-headline">Common questions.</h2>
      </div>

      <ul className="pricing-faq-list font-sans">
        {pricingFaq.map((item) => {
          const open = openId === item.id;
          return (
            <li key={item.id} className="pricing-faq-item">
              <button
                type="button"
                className="pricing-faq-question"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                {item.question}
                <span className="pricing-faq-icon" aria-hidden>
                  {open ? "−" : "+"}
                </span>
              </button>
              {open ? (
                <p className="pricing-faq-answer">{item.answer}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
