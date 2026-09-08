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
  "nav.bookdemo": { en: "Book a demo", es: "Reservar demo", fr: "Réserver une démo", de: "Demo buchen" },
  "nav.proveit": { en: "Prove it", es: "Pruébalo", fr: "Prouvez-le", de: "Überzeugen" },

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
    en: "Orvius runs the night shift on your line — answers after-hours and overflow calls, qualifies the job, books it, and alerts you in seconds.",
    es: "Orvius cubre el turno de noche en tu línea: contesta llamadas fuera de horario y desbordadas, califica el trabajo, lo agenda y te avisa en segundos.",
    fr: "Orvius assure le service de nuit sur votre ligne : il répond aux appels hors horaires et en débordement, qualifie la demande, la planifie et vous alerte en quelques secondes.",
    de: "Orvius übernimmt die Nachtschicht auf Ihrer Leitung: nimmt Anrufe außerhalb der Geschäftszeiten und bei Überlauf an, qualifiziert den Auftrag, bucht ihn und benachrichtigt Sie in Sekunden.",
  },
  "hero.cta": {
    en: "Prove it on your line",
    es: "Pruébalo en tu línea",
    fr: "Testez-le sur votre ligne",
    de: "Testen Sie es auf Ihrer Leitung",
  },
  "hero.liveline": { en: "Live line", es: "Línea en vivo", fr: "Ligne en direct", de: "Live-Leitung" },

  "showcase.eyebrow": { en: "On the line", es: "En la línea", fr: "En ligne", de: "Am Telefon" },
  "showcase.title": {
    en: "In every call, at every step.",
    es: "En cada llamada, en cada paso.",
    fr: "À chaque appel, à chaque étape.",
    de: "Bei jedem Anruf, in jedem Schritt.",
  },
  "showcase.lead": {
    en: "Orvius answers the line, qualifies the job, alerts the owner, and works the dispatch board — one record, start to finish.",
    es: "Orvius contesta la línea, califica el trabajo, avisa al dueño y gestiona el tablero de despacho — un solo registro, de principio a fin.",
    fr: "Orvius répond, qualifie la demande, alerte le patron et gère le tableau de répartition — un seul dossier, du début à la fin.",
    de: "Orvius nimmt ab, qualifiziert den Auftrag, alarmiert den Inhaber und steuert das Dispositions-Board — ein Datensatz, von Anfang bis Ende.",
  },

  "rules.kicker": { en: "Night rules", es: "Reglas de la noche", fr: "Règles de nuit", de: "Nachtregeln" },
  "rules.title": {
    en: "How the shop runs when you're not on the floor.",
    es: "Cómo funciona el taller cuando no estás.",
    fr: "Comment l'atelier tourne quand vous n'êtes pas là.",
    de: "Wie der Betrieb läuft, wenn Sie nicht da sind.",
  },
  "rules.aside": {
    en: "Orvius is the night-shift OS — not an AI receptionist bolted onto a CRM. The board holds every call, job, and dollar in one record.",
    es: "Orvius es el sistema del turno de noche, no una recepcionista de IA pegada a un CRM. El tablero reúne cada llamada, trabajo y dólar en un solo registro.",
    fr: "Orvius est le système d'exploitation de l'équipe de nuit — pas un standard IA greffé sur un CRM. Le tableau réunit chaque appel, intervention et euro dans un seul dossier.",
    de: "Orvius ist das Betriebssystem für die Nachtschicht — keine an ein CRM geschraubte KI-Rezeption. Das Board bündelt jeden Anruf, Auftrag und Euro in einem Datensatz.",
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
    en: "Every call, text, and job compounds one customer record. Book and assign from Attention — no CRM scavenger hunt.",
    es: "Cada llamada, mensaje y trabajo se suma a un solo registro del cliente. Agenda y asigna desde Atención — sin búsquedas en el CRM.",
    fr: "Chaque appel, SMS et intervention alimente un seul dossier client. Planifiez et affectez depuis Attention — sans fouiller le CRM.",
    de: "Jeder Anruf, jede SMS und jeder Auftrag fließt in einen Kundendatensatz. Buchen und zuweisen aus „Attention“ — keine CRM-Schnitzeljagd.",
  },
  "rule3.title": { en: "Proof you can hand a partner.", es: "Pruebas que puedes entregar a un socio.", fr: "Des preuves à remettre à un partenaire.", de: "Belege, die Sie einem Partner geben können." },
  "rule3.body": {
    en: "Weekly captured-demand bookings and estimated value copy as a stamped artifact. No vanity dashboards. No invented ARR.",
    es: "Los trabajos y dólares recuperados cada semana se copian como un comprobante sellado. Sin paneles de vanidad. Sin ARR inventado.",
    fr: "Les interventions et revenus récupérés chaque semaine se copient comme un justificatif horodaté. Pas de tableaux de vanité. Pas d'ARR inventé.",
    de: "Wöchentlich zurückgewonnene Aufträge und Umsätze als abgestempelter Nachweis. Keine Schaufenster-Dashboards. Kein erfundener ARR.",
  },

  "trynow.title": { en: "Try Orvius now.", es: "Prueba Orvius ahora.", fr: "Essayez Orvius maintenant.", de: "Testen Sie Orvius jetzt." },
  "trynow.cta": { en: "Get started →", es: "Empezar →", fr: "Commencer →", de: "Loslegen →" },
  "trynow.call": {
    en: "or call the live line · +1 844 643 9170",
    es: "o llama a la línea en vivo · +1 844 643 9170",
    fr: "ou appelez la ligne en direct · +1 844 643 9170",
    de: "oder rufen Sie die Live-Leitung an · +1 844 643 9170",
  },

  "footer.tagline": {
    en: "The night-shift OS for HVAC, plumbing, and electrical.",
    es: "El sistema del turno de noche para HVAC, plomería y electricidad.",
    fr: "Le système d'exploitation de nuit pour le CVC, la plomberie et l'électricité.",
    de: "Das Nachtschicht-Betriebssystem für HLK, Klempnerei und Elektrik.",
  },
};
