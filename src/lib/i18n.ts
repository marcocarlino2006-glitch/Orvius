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
  "nav.audit": { en: "Audit", es: "Auditoría", fr: "Audit", de: "Audit" },
  "nav.about": { en: "About", es: "Nosotros", fr: "À propos", de: "Über uns" },
  "nav.signin": { en: "Sign in", es: "Iniciar sesión", fr: "Se connecter", de: "Anmelden" },
  "nav.bookdemo": { en: "Book an audit", es: "Reservar una auditoría", fr: "Réserver un audit", de: "Audit buchen" },
  "nav.proveit": { en: "Call the live line", es: "Llamar a la línea en vivo", fr: "Appeler la ligne en direct", de: "Live-Leitung anrufen" },

  "hero.title": {
    en: "After-hours calls become qualified jobs.",
    es: "Las llamadas fuera de horario se vuelven trabajos calificados.",
    fr: "Les appels hors horaires deviennent des interventions qualifiées.",
    de: "Anrufe außerhalb der Geschäftszeiten werden zu qualifizierten Aufträgen.",
  },
  "hero.lead": {
    en: "Proposes a window and alerts the owner — no invented prices.",
    es: "Contesta el turno de noche, propone una franja, avisa al dueño — sin inventar precios ni horas de llegada.",
    fr: "Répond au service de nuit, propose un créneau, alerte le patron — sans inventer de prix ni d’heure d’arrivée.",
    de: "Beantwortet die Nachtschicht, schlägt ein Fenster vor, informiert den Inhaber — ohne Preise oder Ankunftszeiten zu erfinden.",
  },
  "hero.cta": {
    en: "Call the live line",
    es: "Llama a la línea en vivo",
    fr: "Appelez la ligne en direct",
    de: "Live-Leitung anrufen",
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

  "rules.kicker": { en: "Night rules", es: "Reglas de la noche", fr: "Règles de nuit", de: "Nachtregeln" },
  "rules.title": {
    en: "How the shop runs when you're not on the floor.",
    es: "Cómo funciona el taller cuando no estás.",
    fr: "Comment l'atelier tourne quand vous n'êtes pas là.",
    de: "Wie der Betrieb läuft, wenn Sie nicht da sind.",
  },
  "rules.aside": {
    en: "Orvius starts as the night shift and keeps the operational record. The board connects every call, job, and confirmation the line captures.",
    es: "Orvius comienza como el turno nocturno y conserva el registro operativo. El tablero conecta cada llamada, trabajo y confirmación que captura la línea.",
    fr: "Orvius commence comme l'équipe de nuit et conserve le dossier opérationnel. Le tableau relie chaque appel, intervention et confirmation capturés par la ligne.",
    de: "Orvius beginnt als Nachtschicht und führt den Betriebsdatensatz. Das Board verbindet jeden Anruf, Auftrag und jede Bestätigung, die die Leitung erfasst.",
  },
  "rule1.title": { en: "The bay never goes dark.", es: "El taller nunca se apaga.", fr: "L'atelier ne s'éteint jamais.", de: "Die Werkstatt steht nie still." },
  "rule1.body": {
    en: "After-hours and overflow get answered, qualified, and alerted — demand does not die on voicemail.",
    es: "Las llamadas fuera de horario y el exceso se contestan, califican y avisan — la demanda no muere en el buzón.",
    fr: "Les appels hors horaires et les débordements sont pris, qualifiés et signalés — la demande ne meurt pas dans la messagerie.",
    de: "Anrufe außerhalb der Zeiten und Überlauf werden angenommen, qualifiziert und gemeldet — Nachfrage stirbt nicht in der Mailbox.",
  },
  "rule2.title": { en: "One board. Not twelve tabs.", es: "Un tablero. No doce pestañas.", fr: "Un tableau. Pas douze onglets.", de: "Ein Board. Nicht zwölf Tabs." },
  "rule2.body": {
    en: "Every call, text, job, and recorded outcome stays on one customer record. Book and assign from Command — no CRM scavenger hunt.",
    es: "Cada llamada, mensaje, trabajo y resultado registrado permanece en un solo expediente del cliente. Agenda y asigna desde Command, sin búsquedas en el CRM.",
    fr: "Chaque appel, SMS, intervention et résultat enregistré reste dans un seul dossier client. Planifiez et affectez depuis Command, sans fouiller le CRM.",
    de: "Jeder Anruf, jede SMS, jeder Auftrag und jedes erfasste Ergebnis bleibt in einem Kundendatensatz. Buchen und zuweisen aus Command — ohne CRM-Suche.",
  },
  "rule3.title": { en: "A clear weekly summary.", es: "Un resumen semanal claro.", fr: "Un résumé hebdomadaire clair.", de: "Eine klare Wochenübersicht." },
  "rule3.body": {
    en: "See what the line booked this week — jobs and estimated value you can check against your own books.",
    es: "Mira lo que la línea reservó esta semana — trabajos y valor estimado que puedes contrastar con tus propios números.",
    fr: "Voyez ce que la ligne a réservé cette semaine — interventions et valeur estimée à vérifier dans vos propres livres.",
    de: "Sehen Sie, was die Leitung diese Woche gebucht hat — Aufträge und geschätzter Wert zum Abgleich mit Ihren eigenen Zahlen.",
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
    en: "The night-shift OS for HVAC, plumbing, and electrical.",
    es: "El sistema del turno de noche para HVAC, plomería y electricidad.",
    fr: "Le système d'exploitation de nuit pour le CVC, la plomberie et l'électricité.",
    de: "Das Nachtschicht-Betriebssystem für HLK, Klempnerei und Elektrik.",
  },
};
