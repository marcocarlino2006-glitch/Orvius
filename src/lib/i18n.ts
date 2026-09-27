/**
 * Lightweight marketing i18n. Keys are applied to [data-i18n] nodes at runtime
 * by <I18nRuntime />. English is the source of truth; other languages cover the
 * home landing + chrome. Deep pages remain English until translated.
 */
export type Lang = "en" | "es" | "fr" | "de";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

export const translations: Record<string, Record<Lang, string>> = {
  "nav.product": { en: "Product", es: "Producto", fr: "Produit", de: "Produkt" },
  "nav.enterprise": { en: "Enterprise", es: "Empresas", fr: "Entreprise", de: "Unternehmen" },
  "nav.pricing": { en: "Pricing", es: "Precios", fr: "Tarifs", de: "Preise" },
  "nav.resources": { en: "Resources", es: "Recursos", fr: "Ressources", de: "Ressourcen" },
  "nav.audit": { en: "Call audit", es: "Auditoría de llamadas", fr: "Audit d’appels", de: "Anruf-Audit" },
  "nav.about": { en: "About", es: "Nosotros", fr: "À propos", de: "Über uns" },
  "nav.signin": { en: "Sign in", es: "Iniciar sesión", fr: "Se connecter", de: "Anmelden" },
  "nav.bookdemo": { en: "Book an audit", es: "Reservar una auditoría", fr: "Réserver un audit", de: "Audit buchen" },
  "nav.proveit": { en: "Call the live line", es: "Llamar a la línea en vivo", fr: "Appeler la ligne en direct", de: "Live-Leitung anrufen" },
  "nav.contact": { en: "Talk to us", es: "Hablar con nosotros", fr: "Nous contacter", de: "Kontakt" },

  "hero.title": {
    en: "After-hours calls become qualified jobs.",
    es: "Las llamadas fuera de horario se vuelven trabajos calificados.",
    fr: "Les appels hors horaires deviennent des interventions qualifiées.",
    de: "Anrufe außerhalb der Geschäftszeiten werden zu qualifizierten Aufträgen.",
  },
  "hero.lead": {
    en: "Orvius is the AI receptionist for HVAC shops. It answers the calls you can't take, offers an open window from your schedule, and texts you the job.",
    es: "Orvius es la recepcionista con IA para talleres de climatización. Contesta las llamadas que usted no puede, ofrece un horario libre de su agenda y le envía el trabajo por mensaje.",
    fr: "Orvius est le réceptionniste IA des entreprises de chauffage et climatisation. Il répond aux appels que vous ne pouvez pas prendre, propose un créneau libre de votre planning et vous envoie l’intervention par SMS.",
    de: "Orvius ist die KI-Rezeption für Heizungs- und Klimabetriebe. Sie nimmt die Anrufe an, die Sie nicht annehmen können, bietet einen freien Termin aus Ihrem Kalender an und schickt Ihnen den Auftrag per SMS.",
  },
  "hero.cta": {
    en: "Call the live line",
    es: "Llama a la línea en vivo",
    fr: "Appelez la ligne en direct",
    de: "Live-Leitung anrufen",
  },
  "hero.demo": {
    en: "Book a call audit",
    es: "Reservar una auditoría",
    fr: "Réserver un audit",
    de: "Audit buchen",
  },
  "hero.liveline": { en: "Live line", es: "Línea en vivo", fr: "Ligne en direct", de: "Live-Leitung" },
  "hero.nightshift": {
    en: "Call the live line",
    es: "Llama a la línea en vivo",
    fr: "Appelez la ligne en direct",
    de: "Live-Leitung anrufen",
  },

  "showcase.eyebrow": { en: "On the line", es: "En la línea", fr: "En ligne", de: "Am Telefon" },
  "showcase.title": {
    en: "From first ring to job record.",
    es: "Desde el primer timbre hasta el registro del trabajo.",
    fr: "De la première sonnerie au dossier d'intervention.",
    de: "Vom ersten Klingeln bis zum Auftragsdatensatz.",
  },
  "showcase.lead": {
    en: "Orvius qualifies the request, proposes a capacity-aware window, texts for confirmation, alerts the owner, and writes one record the shop can act on.",
    es: "Orvius califica la solicitud, propone una franja según la capacidad, envía la confirmación por SMS, avisa al dueño y crea un registro accionable.",
    fr: "Orvius qualifie la demande, propose un créneau selon la capacité, demande confirmation par SMS, alerte le patron et crée un dossier exploitable.",
    de: "Orvius qualifiziert die Anfrage, schlägt ein kapazitätsgerechtes Zeitfenster vor, holt per SMS die Bestätigung ein, informiert den Inhaber und erstellt einen verwertbaren Datensatz.",
  },

  "rules.aside": {
    en: "Orvius starts as the night shift and keeps the operational record. The board connects every call, job, and confirmation the line captures.",
    es: "Orvius comienza como el turno nocturno y conserva el registro operativo. El tablero conecta cada llamada, trabajo y confirmación que captura la línea.",
    fr: "Orvius commence comme l'équipe de nuit et conserve le dossier opérationnel. Le tableau relie chaque appel, intervention et confirmation capturés par la ligne.",
    de: "Orvius beginnt als Nachtschicht und führt den Betriebsdatensatz. Das Board verbindet jeden Anruf, Auftrag und jede Bestätigung, die die Leitung erfasst.",
  },

  "trynow.title": { en: "Try Orvius now.", es: "Prueba Orvius ahora.", fr: "Essayez Orvius maintenant.", de: "Testen Sie Orvius jetzt." },
  "trynow.cta": { en: "Call the live line →", es: "Llama a la línea en vivo →", fr: "Appelez la ligne en direct →", de: "Live-Leitung anrufen →" },
  "trynow.call": {
    en: "or book a live call audit",
    es: "o reserva una auditoría de llamadas en vivo",
    fr: "ou réservez un audit d'appels en direct",
    de: "oder einen Live-Anruf-Audit buchen",
  },

  "footer.tagline": {
    en: "Focused AI receptionist for HVAC — missed calls to paid jobs.",
    es: "Recepcionista de IA para HVAC — de llamadas perdidas a trabajos pagados.",
    fr: "Réceptionniste IA pour le CVC — des appels manqués aux travaux payés.",
    de: "KI-Rezeption für HVAC — von verpassten Anrufen zu bezahlten Jobs.",
  },
};
