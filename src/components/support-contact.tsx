import { SUPPORT_RESPONSE, supportEmail, supportMailto, supportPhone } from "@/lib/support";

type SupportContactProps = {
  lead?: string;
  subject?: string;
  path?: string;
  reference?: string;
  className?: string;
};

/** "Get me a human", worded the same on every surface that offers it. */
export function SupportContact({ lead = "Need a person?", subject, path, reference, className }: SupportContactProps) {
  const phone = supportPhone();
  const mail = supportMailto({ subject, path, reference });
  return (
    <p className={["support-contact", className].filter(Boolean).join(" ")}>
      {lead}{" "}
      {phone ? (
        <>
          Call or text <a href={`tel:${phone.tel}`}>{phone.display}</a>, or email <a href={mail}>{supportEmail}</a>.
        </>
      ) : (
        <>
          Email <a href={mail}>{supportEmail}</a>.
        </>
      )}{" "}
      {SUPPORT_RESPONSE}
    </p>
  );
}
