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
    en: "The calls you can't take, answered and booked.",
    es: "Las llamadas que usted no puede tomar, contestadas y agendadas.",
    fr: "Les appels que vous ne pouvez pas prendre, répondus et réservés.",
    de: "Die Anrufe, die Sie nicht annehmen können — angenommen und gebucht.",
  },
  "hero.lead": {
    en: "HVAC, plumbing, electrical — any shop that runs on the phone. Orvius answers, checks your real schedule, books the job and shows you every step.",
    es: "HVAC, plomería, electricidad: cualquier negocio que vive del teléfono. Orvius contesta, revisa tu agenda real, agenda el trabajo y te muestra cada paso.",
    fr: "CVC, plomberie, électricité : toute entreprise qui vit du téléphone. Orvius répond, vérifie votre vrai planning, réserve l’intervention et vous montre chaque étape.",
    de: "HLK, Sanitär, Elektro – jeder Betrieb, der vom Telefon lebt. Orvius nimmt ab, prüft Ihren echten Kalender, bucht den Auftrag und zeigt Ihnen jeden Schritt.",
  },
  "hero.watch": {
    en: "Watch it run a shop",
    es: "Míralo llevar un negocio",
    fr: "Regardez-le gérer une entreprise",
    de: "Sehen Sie es einen Betrieb führen",
  },
  "hero.try": {
    en: "Hear it as your business",
    es: "Escúchelo como su negocio",
    fr: "Écoutez-le pour votre entreprise",
    de: "Als Ihr Unternehmen anhören",
  },
  "hero.start": { en: "Get started", es: "Empezar", fr: "Commencer", de: "Loslegen" },
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
    en: "The AI front desk for every business that runs on the phone.",
    es: "La recepción con IA para cada negocio que vive del teléfono.",
    fr: "L’accueil IA de chaque entreprise qui vit du téléphone.",
    de: "Die KI-Rezeption für jedes Unternehmen, das vom Telefon lebt.",
  },
};
