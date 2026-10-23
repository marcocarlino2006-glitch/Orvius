#!/usr/bin/env node
/*
 * Ask is a conversation, not a search box: it remembers the last exchanges,
 * resolves "her" / "and tomorrow?" against them, opens with the shop's real
 * standing, and answers progressively instead of in one dead block. Facts
 * still come only from records — history never becomes a fact source.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { answerWithModel, buildAskPrompt } from "../src/lib/ask-model.ts";
import { retrievalQuery } from "../src/lib/shop-brain.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const memory = {
  query: "Dana Whitfield",
  stats: { customers: 1, jobs: 2, leads: 0, calls: 0 },
  hits: [
    {
      type: "customer",
      id: "cus_dana",
      href: "/dashboard/customers/cus_dana",
      title: "Dana Whitfield",
      summary: "+1 312 555 0146 · 1500 Chicago Ave · 3 interactions",
      score: 10,
      observedAt: "2026-09-23T10:00:00.000Z",
    },
    {
      type: "job",
      id: "job_duct",
      href: "/dashboard/jobs/job_duct",
      title: "Duct cleaning",
      summary: "scheduled · Chris Lee · Dana Whitfield · scheduled Wed, Sep 23, 1:00 PM · final $680",
      score: 8,
      observedAt: "2026-09-23T10:00:00.000Z",
    },
  ],
};
const brief = { matters: [], uncertainty: [], recommendation: null };
const history = [{ question: "What's going on with Dana Whitfield?", answer: "Duct cleaning for Dana is booked Wed 1:00 PM with Chris Lee." }];

test("follow-up questions search with the previous question attached", () => {
  assert.equal(retrievalQuery("And tomorrow?", history), "What's going on with Dana Whitfield? And tomorrow?");
  assert.equal(retrievalQuery("Text her back", history), "What's going on with Dana Whitfield? Text her back");
  assert.equal(
    retrievalQuery("How much did we collect this month?", history),
    "How much did we collect this month?",
    "a full new question is not polluted by history",
  );
  assert.equal(retrievalQuery("And tomorrow?", []), "And tomorrow?", "no history, no expansion");
});

test("the model sees the conversation but is told it is never a fact source", () => {
  const { system, user } = buildAskPrompt({ question: "And tomorrow?", memory, brief, history });
  assert.match(user, /CONVERSATION:/);
  assert.match(user, /Owner: What's going on with Dana Whitfield\?/);
  assert.match(system, /never a source of new facts/);
  assert.match(system, /Never invent/);
  assert.match(system, /followUp/, "the model is asked for one natural next question");
});

test("a model follow-up survives parsing and grounding", async () => {
  const fetchImpl = async (url, init) => {
    const text = JSON.stringify({
      answer: "Duct cleaning for Dana is at 1:00 PM with Chris Lee.",
      cited: ["job_duct"],
      unsure: null,
      followUp: "Want me to check if Chris confirmed?",
    });
    return Response.json({ choices: [{ message: { content: text } }] });
  };
  const out = await answerWithModel({ question: "And tomorrow?", memory, brief, history, env: { OPENAI_API_KEY: "sk" }, fetchImpl });
  assert.equal(out.followUp, "Want me to check if Chris confirmed?");
});

test("a follow-up about a record is not hijacked by the exact-answer matcher", () => {
  const brain = read("src/lib/shop-brain.ts");
  assert.match(brain, /followUpAboutRecord/, "record follow-ups skip the today-list matcher");
  assert.match(brain, /TIME_WORD/, "unless the follow-up names its own time window");
});

test("the page holds a conversation: history out, opening in, answer revealed progressively", () => {
  const page = read("src/app/dashboard/ask/page.tsx");
  assert.match(page, /body: JSON\.stringify\(\{ question: q, history \}\)/, "finished turns are sent back");
  assert.match(page, /fetch\("\/api\/ask"\)/, "the opening brief loads on arrival");
  assert.match(page, /opening\?\.headline/, "the shop's standing opens the page, not a static headline");
  assert.match(page, /Reading shop records…/, "thinking starts with the records step");
  assert.match(page, /Checking calls, jobs and money…/, "thinking shows its work");
  assert.match(page, /function RevealText/, "answers stream in progressively");
  assert.match(page, /turn\.followUp/, "the model's next question is offered as a chip");
  const route = read("src/app/api/ask/route.ts");
  assert.match(route, /readHistory/, "the route validates and caps history");
  assert.match(route, /askOpening/, "GET returns the opening brief");
});

test("Command shows it is alive: breathing line dot, live clock, feed that arrives", () => {
  const pulse = read("src/components/orvius-pulse.tsx");
  assert.match(pulse, /Live ·/, "freshness is stated as live, with the shop's clock");
  const system = read("src/app/dashboard/orvius.css");
  assert.match(system, /@keyframes op-breathe/, "a healthy line breathes");
  assert.match(system, /ask-caret-blink/, "Ask types with a caret");
  const work = read("src/app/dashboard/orvius.css");
  assert.match(work, /@keyframes cmd-feed-in/, "the feed arrives like work happening");
  assert.match(work + system, /prefers-reduced-motion/, "motion respects reduced-motion");
});
