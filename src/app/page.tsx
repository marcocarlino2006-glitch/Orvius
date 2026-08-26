import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="card p-10">
        <p className="text-sm uppercase tracking-[0.25em] text-sky-300">
          Orvius
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
          The AI receptionist that helps service businesses never miss revenue.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Answer calls, qualify leads, capture details, and notify the owner —
          starting with home services. This is your controllable MVP foundation.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/admin" className="btn btn-primary">
            Set up a business
          </Link>
          <Link href="/dashboard" className="btn btn-secondary">
            Open dashboard
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Feature
            title="Vapi + Twilio"
            body="Uses the stack you already have — but code you fully own."
          />
          <Feature
            title="Lead capture"
            body="Every completed call becomes a lead with summary and owner alert."
          />
          <Feature
            title="Vertical-ready"
            body="Preconfigured for HVAC/plumbing/electrical style workflows."
          />
        </div>
      </div>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
