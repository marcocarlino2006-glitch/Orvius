export type ShopContact = { name: string; phone: string | null } | null;

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : raw;
}

/** A public page that is switched off still gives the customer a way to reach the shop. */
export function PublicShopFallback({ title, contact, ask }: { title: string; contact: ShopContact; ask: string }) {
  return (
    <main className="pf pf--center">
      <div className="pf-head">
        {contact ? <p className="pf-kicker">{contact.name}</p> : null}
        <h1 className="pf-title">{title}</h1>
        <p className="pf-sub">{contact?.phone ? `Call ${contact.name} ${ask}.` : `Call the business ${ask}.`}</p>
      </div>
      {contact?.phone ? (
        <a className="pf-btn pf-btn--primary" href={`tel:${contact.phone}`}>
          Call {formatPhone(contact.phone)}
        </a>
      ) : null}
    </main>
  );
}
