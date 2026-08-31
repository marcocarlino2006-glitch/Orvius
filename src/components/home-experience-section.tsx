import { HomeCallDemo } from "@/components/home-call-demo";

const steps = [
  {
    step: "01",
    title: "Customer calls",
    body: "A customer calls your business. Orvius answers in under 2 seconds.",
  },
  {
    step: "02",
    title: "AI qualifies",
    body: "Orvius asks the right questions and captures service, urgency, and address.",
  },
  {
    step: "03",
    title: "Owner alerted",
    body: "Lead lands in the inbox. Owner gets an SMS with a deep link in under 60 seconds.",
  },
] as const;

export function HomeExperienceSection() {
  return (
    <section className="home-experience home-experience-light" aria-labelledby="experience-heading">
      <div className="editorial-wrap">
        <div className="home-experience-head home-experience-head-center">
          <h2 id="experience-heading" className="home-experience-title font-sans">
            One emergency call, end to end
          </h2>
          <p className="home-experience-lead font-sans">
            What happens when a homeowner calls after hours — without voicemail,
            hold music, or a blank CRM.
          </p>
        </div>

        <ol className="home-experience-grid font-sans">
          {steps.map((item) => (
            <li key={item.step} className="home-experience-grid-item">
              <span className="home-experience-grid-num" aria-hidden>
                {item.step}
              </span>
              <h3 className="home-experience-grid-title">{item.title}</h3>
              <p className="home-experience-grid-body">{item.body}</p>
            </li>
          ))}
        </ol>

        <div className="home-experience-call">
          <HomeCallDemo variant="light" size="section" />
        </div>
      </div>
    </section>
  );
}
