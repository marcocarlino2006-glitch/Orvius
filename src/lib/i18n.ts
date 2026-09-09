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
  "nav.signin": { en: "Sign in", es: "Iniciar sesión", fr: "Se connecter", de: "Anmelden" },
  "nav.bookdemo": { en: "Book an audit", es: "Reservar una auditoría", fr: "Réserver un audit", de: "Audit buchen" },
  "nav.proveit": { en: "Call live AI", es: "Llamar a la IA en vivo", fr: "Appeler l'IA en direct", de: "Live-KI anrufen" },

  "hero.eyebrow": {
    en: "For HVAC, plumbing & electrical shops",
    es: "Para talleres de HVAC, plomería y electricidad",
    fr: "Pour les entreprises de CVC, plomberie et électricité",
    de: "Für HLK-, Klempner- und Elektrobetriebe",
  },
  "hero.title": {
    en: "Missed calls become booked jobs.",
    es: "Las llamadas perdidas se vuelven trabajos agendados.",
    fr: "Les appels manqués deviennent des interventions planifiées.",
    de: "Verpasste Anrufe werden zu gebuchten Aufträgen.",
  },
  "hero.lead": {
    en: "Orvius answers after-hours and overflow calls, captures the request, proposes an open service window, and alerts the owner — without inventing prices or arrival times.",
    es: "Orvius contesta llamadas fuera de horario y desbordadas, registra la solicitud, propone una franja disponible y avisa al dueño, sin inventar precios ni horas de llegada.",
    fr: "Orvius répond aux appels hors horaires et en débordement, enregistre la demande, propose un créneau disponible et alerte le patron, sans inventer de prix ni d'heure d'arrivée.",
    de: "Orvius nimmt Anrufe außerhalb der Geschäftszeiten und bei Überlauf an, erfasst die Anfrage, schlägt ein freies Zeitfenster vor und informiert den Inhaber — ohne Preise oder Ankunftszeiten zu erfinden.",
  },
  "hero.cta": {
    en: "Call the live AI",
    es: "Llama a la IA en vivo",
    fr: "Appelez l'IA en direct",
    de: "Live-KI anrufen",
  },
  "hero.liveline": { en: "Live line", es: "Línea en vivo", fr: "Ligne en direct", de: "Live-Leitung" },
  "hero.nightshift": {
    en: "Orvius answers the night shift",
    es: "Orvius contesta el turno de noche",
    fr: "Orvius répond pendant la nuit",
    de: "Orvius übernimmt die Nachtschicht",
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
    en: "Orvius starts as the AI night shift and keeps the operational record. The board connects every call, job, confirmation, and recorded dollar.",
    es: "Orvius comienza como el turno nocturno de IA y conserva el registro operativo. El tablero conecta cada llamada, trabajo, confirmación y dólar registrado.",
    fr: "Orvius commence comme l'équipe de nuit IA et conserve le dossier opérationnel. Le tableau relie chaque appel, intervention, confirmation et euro enregistré.",
    de: "Orvius beginnt als KI-Nachtschicht und führt den Betriebsdatensatz. Das Board verbindet jeden Anruf, Auftrag, jede Bestätigung und jeden erfassten Euro.",
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
    en: "Every call, text, job, and recorded outcome stays on one customer record. Book and assign from Attention — no CRM scavenger hunt.",
    es: "Cada llamada, mensaje, trabajo y resultado registrado permanece en un solo expediente del cliente. Agenda y asigna desde Atención, sin búsquedas en el CRM.",
    fr: "Chaque appel, SMS, intervention et résultat enregistré reste dans un seul dossier client. Planifiez et affectez depuis Attention, sans fouiller le CRM.",
    de: "Jeder Anruf, jede SMS, jeder Auftrag und jedes erfasste Ergebnis bleibt in einem Kundendatensatz. Buchen und zuweisen aus Attention — ohne CRM-Suche.",
  },
  "rule3.title": { en: "Proof you can hand a partner.", es: "Pruebas que puedes entregar a un socio.", fr: "Des preuves à remettre à un partenaire.", de: "Belege, die Sie einem Partner geben können." },
  "rule3.body": {
    en: "Weekly captured-demand bookings and estimated value copy as a stamped artifact. No vanity dashboards. No invented ARR.",
    es: "Las reservas de demanda capturada y su valor estimado se copian cada semana como un comprobante fechado. Sin paneles de vanidad ni ARR inventado.",
    fr: "Les réservations issues de la demande captée et leur valeur estimée se copient chaque semaine sous forme de preuve horodatée. Pas de tableaux de vanité ni d'ARR inventé.",
    de: "Wöchentliche Buchungen aus erfasster Nachfrage und ihr geschätzter Wert lassen sich als datierter Nachweis kopieren. Keine Schaufenster-Dashboards und kein erfundener ARR.",
  },

  "trynow.title": { en: "Try Orvius now.", es: "Prueba Orvius ahora.", fr: "Essayez Orvius maintenant.", de: "Testen Sie Orvius jetzt." },
  "trynow.cta": { en: "Call the live AI →", es: "Llama a la IA en vivo →", fr: "Appelez l'IA en direct →", de: "Live-KI anrufen →" },
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
