#!/usr/bin/env node
/* The density board: same-trade shops per three-digit ZIP area, densest first. */
import assert from "node:assert/strict";
import test from "node:test";

const { densityClusters, densityText, networkReadyAreas, zip3FromAddress } = await import("../src/lib/network-density.ts");

test("shops group by ZIP area and trade, densest first", () => {
  const shops = [
    { trade: "HVAC", zip3: "606", networkOn: true },
    { trade: "hvac", zip3: "606", networkOn: true },
    { trade: "HVAC", zip3: "606", networkOn: false },
    { trade: "Plumbing", zip3: "606", networkOn: true },
    { trade: "HVAC", zip3: "100", networkOn: false },
    { trade: null, zip3: "100", networkOn: false },
    { trade: "HVAC", zip3: null, networkOn: true },
  ];
  const clusters = densityClusters(shops);
  assert.deepEqual(clusters[0], { zip3: "606", trade: "hvac", shops: 3, networkOn: 2 });
  assert.equal(clusters.length, 4, "a shop with no ZIP is not placed");
  assert.equal(networkReadyAreas(clusters), 1, "only 606 HVAC has two shops on the network");
  assert.equal(densityText(clusters.slice(0, 1)), "606xx hvac 3 (2 on network)");
  assert.equal(densityText([]), "none yet");
  assert.equal(densityClusters(shops, 2).length, 2);
});

test("the ZIP area is read from the last ZIP in an address", () => {
  assert.equal(zip3FromAddress("418 Elm St, Evanston IL 60201"), "602");
  assert.equal(zip3FromAddress("Suite 12345, Chicago IL 60614-2201"), "606");
  assert.equal(zip3FromAddress("no zip here"), null);
  assert.equal(zip3FromAddress(null), null);
});
