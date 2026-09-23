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
  "nav.contact": { en: "Contact sales", es: "Hablar con ventas", fr: "Contacter les ventes", de: "Vertrieb kontaktieren" },

  "hero.title": {
    en: "After-hours service calls become qualified jobs.",
    es: "Las llamadas de servicio fuera de horario se vuelven trabajos calificados.",
    fr: "Les appels de service hors horaires deviennent des interventions qualifiées.",
    de: "Serviceanrufe außerhalb der Geschäftszeiten werden zu qualifizierten Aufträgen.",
  },
  "hero.lead": {
    en: "Orvius answers missed and after-hours calls for HVAC, plumbing, electrical, and other trades. It understands the request, captures the customer's details, checks urgency and service area, books or escalates the job, alerts the team, and tracks the opportunity toward completed and paid work.",
    es: "Orvius contesta llamadas perdidas y fuera de horario para HVAC, plomería, electricidad y otros oficios. Entiende la solicitud, captura los datos del cliente, revisa urgencia y zona de servicio, agenda o escala el trabajo, alerta al equipo y sigue la oportunidad hasta trabajo completado y pagado.",
    fr: "Orvius répond aux appels manqués et hors horaires pour le CVC, la plomberie, l'électricité et d'autres métiers. Il comprend la demande, capture les détails du client, vérifie l'urgence et la zone, réserve ou escalade, alerte l'équipe et suit l'opportunité jusqu'au travail terminé et payé.",
    de: "Orvius beantwortet verpasste und außerordentliche Anrufe für HVAC, Sanitär, Elektro und andere Gewerke. Es versteht die Anfrage, erfasst Kundendaten, prüft Dringlichkeit und Gebiet, bucht oder eskaliert, alarmiert das Team und verfolgt die Chance bis zu abgeschlossener und bezahlter Arbeit.",
  },
  "hero.cta": {
    en: "Call the live line",
    es: "Llama a la línea en vivo",
    fr: "Appelez la ligne en direct",
    de: "Live-Leitung anrufen",
  },
  "hero.demo": {
    en: "Book a live call audit",
    es: "Reservar una auditoría de llamadas en vivo",
    fr: "Réserver un audit d'appels en direct",
    de: "Live-Anruf-Audit buchen",
  },
  "hero.liveline": {
    en: "Night shift · live line",
    es: "Turno nocturno · línea en vivo",
    fr: "Service de nuit · ligne en direct",
    de: "Nachtschicht · Live-Leitung",
  },
  "hero.nightshift": {
    en: "Night shift · live line",
    es: "Turno nocturno · línea en vivo",
    fr: "Service de nuit · ligne en direct",
    de: "Nachtschicht · Live-Leitung",
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

  "rules.kicker": {
    en: "How Orvius works",
    es: "Cómo funciona Orvius",
    fr: "Comment Orvius fonctionne",
    de: "So arbeitet Orvius",
  },
  "rules.title": {
    en: "One loop for every essential service call.",
    es: "Un mismo ciclo para cada llamada de servicio esencial.",
    fr: "Une même boucle pour chaque appel de service essentiel.",
    de: "Ein Ablauf für jeden essenziellen Serviceanruf.",
  },
  "rules.aside": {
    en: "The same path runs for HVAC, plumbing, electrical, and other trades — with terminology and emergency rules that match the shop on the line.",
    es: "El mismo camino corre para HVAC, plomería, electricidad y otros oficios — con terminología y reglas de emergencia propias de cada taller.",
    fr: "Le même parcours s'applique au CVC, à la plomberie, à l'électricité et aux autres métiers — avec le langage et les règles d'urgence de l'atelier.",
    de: "Derselbe Pfad gilt für HVAC, Sanitär, Elektro und andere Gewerke — mit Fachsprache und Notfallregeln des jeweiligen Betriebs.",
  },
  "rules.mission": {
    en: "Starting with the service call, Orvius is building the operating layer for the trades that keep the world running.",
    es: "Empezando por la llamada de servicio, Orvius construye la capa operativa para los oficios que mantienen el mundo en marcha.",
    fr: "En commençant par l'appel de service, Orvius construit la couche opérationnelle pour les métiers qui font tourner le monde.",
    de: "Beginnend mit dem Serviceanruf baut Orvius die Betriebsschicht für die Gewerke, die die Welt am Laufen halten.",
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
    en: "AI operating layer for essential service businesses — after-hours calls to qualified jobs.",
    es: "Capa operativa de IA para negocios de servicio esencial — de llamadas fuera de horario a trabajos calificados.",
    fr: "Couche opérationnelle IA pour les entreprises de service essentiel — des appels hors horaires aux interventions qualifiées.",
    de: "KI-Betriebsschicht für essenzielle Servicebetriebe — von außerordentlichen Anrufen zu qualifizierten Aufträgen.",
  },
};
