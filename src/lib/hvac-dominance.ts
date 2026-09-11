/**
 * HVAC dominance capabilities — product source of truth.
 * Docs/HVAC-DOMINANCE-CAPABILITIES.md mirrors this for long-form reading.
 */

export type DominanceCapability = {
  id: string;
  title: string;
  body: string;
};

export type MoatLayer = {
  id: string;
  layer: string;
  compounds: string;
};

export const DOMINANCE_INTRO =
  "A multibillion-dollar company does not need the most features. It needs to become the most trusted and economically valuable system in a critical workflow. For Orvius, that means mastering five capabilities simultaneously.";

export const DOMINANCE_CAPABILITIES: DominanceCapability[] = [
  {
    id: "demand_capture",
    title: "1. Demand capture",
    body: "Orvius must answer every eligible call and text quickly, understand the caller's intent, identify repeat customers, and preserve context across channels. It needs robust phone infrastructure, low latency, accurate transcription, reliable SMS, consent and opt-out handling, multilingual readiness where demanded, and a clear human fallback.",
  },
  {
    id: "workflow_intelligence",
    title: "2. HVAC workflow intelligence",
    body: "The system must understand the differences between emergency, diagnostic, maintenance, installation, replacement, membership, and warranty requests. It must know what questions are required, what the shop accepts, what belongs outside the service area, which situations require a human, and what information a technician needs. This should be represented as structured policies and workflows, not left entirely to a model prompt.",
  },
  {
    id: "execution",
    title: "3. Execution and coordination",
    body: "Orvius must turn a conversation into valid work. That requires calendar and field-service integrations, availability checks, duration and skill constraints, dispatch readiness, reminders, customer updates, owner approvals, and recovery when APIs fail. The product should make the whole shop faster without forcing the shop to abandon systems that already work.",
  },
  {
    id: "revenue",
    title: "4. Revenue and payment infrastructure",
    body: "After capture and coordination are reliable, Orvius should help recover missed leads, follow up on quotes, manage membership reminders, issue invoices, request deposits, collect payments, and show cash-flow status through proper providers. This layer can increase customer value and retention, but it must be built with security, fraud controls, privacy, compliance, and transparent customer consent.",
  },
  {
    id: "trust",
    title: "5. Trust and proof",
    body: "Every action must be explainable, auditable, reversible where possible, and attributable to a confirmed system result. Orvius must measure business outcomes honestly and provide owners with evidence: response time, qualified leads, bookings, handoffs, no-shows, customer satisfaction, collection time, and revenue.",
  },
];

export const MOAT_LAYERS: MoatLayer[] = [
  {
    id: "configuration",
    layer: "Configuration",
    compounds:
      "Business policies, service area, hours, job types, escalation rules, and scripts.",
  },
  {
    id: "workflow_data",
    layer: "Workflow data",
    compounds:
      "Labeled conversations, outcomes, booking accuracy, handoffs, and follow-up results.",
  },
  {
    id: "integrations",
    layer: "Integrations",
    compounds: "Phone, calendar, FSM, dispatch, invoicing, and payments.",
  },
  {
    id: "reputation",
    layer: "Reputation",
    compounds:
      "Case studies, references, support quality, and category expertise.",
  },
  {
    id: "distribution",
    layer: "Distribution",
    compounds:
      "Partners, associations, agencies, consultants, and referrals.",
  },
  {
    id: "economic_embedding",
    layer: "Economic embedding",
    compounds: "Payments, collections, and financial workflows.",
  },
];

export const MOAT_STRATEGIC_TEST =
  "The strategic test is simple: a competitor may copy a phone agent, but it should not be easy to copy Orvius's trusted HVAC operating playbook, customer evidence, integrations, distribution, and transaction history all at once.";

export const FOUNDER_FOCUS =
  "For the first year, founders should spend disproportionate time on customer conversations, deployment quality, call review, and measurable ROI. They should not spend disproportionate time on futuristic branding, broad feature requests, or model experimentation that does not improve a customer outcome.";
