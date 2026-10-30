import { createFixture } from "../harness/fixture";
import { RecipeReader, evaluateCondition } from "../src/game/api";
import { readWorld } from "../src/catalogue/readWorld";
import { readPreferences } from "../src/state/preferences";
import { defaults, obj } from "../src/domain/model";
test("effective recipe observer captures intended calls and cleans up", () => {
  const f = createFixture(),
    reader = new RecipeReader(f.api),
    raw = { name: "A", baseItem: { name: "A" }, perfectItem: { name: "A" } };
  const captured = reader.read(raw, f.flags);
  expect(captured.recipe).toEqual(raw);
  expect(captured.recipe).not.toBe(raw);
  expect(captured.stats.perfection).toBe(100);
  reader.dispose();
  expect(() => reader.read(raw, f.flags)).toThrow("unavailable");
});
test("indexing does not evaluate random expressions", () => {
  const f = createFixture();
  let calls = 0;
  f.api.utils.evalExp = () => {
    calls++;
    return 1;
  };
  expect(evaluateCondition(f.api, "{rng} > .5", {})).toBeUndefined();
  expect(calls).toBe(0);
});
test("catalogue reads market stock, knowledge and actual outputs", () => {
  const f = createFixture(),
    r = new RecipeReader(f.api),
    w = readWorld(f.api, f.getState(), f.flags, r, 1);
  r.dispose();
  expect(w.recipes).toHaveLength(19);
  expect(w.recipes.filter((r) => r.known)).toHaveLength(18);
  expect(
    w.sources.get("Moonleaf")?.find((s) => s.location === "Valley market"),
  ).toMatchObject({ quantity: 90, availability: "available" });
  expect(w.markets.find((m) => m.name === "Distant market")?.availability).toBe(
    "possible",
  );
});
test("preferences are character-scoped and invalid values are sanitized", () => {
  const f = createFixture(),
    p = defaults();
  p.options.farm = true;
  p.reservations.A = 3;
  f.setModData("afnm-profitseeker", "preferences", p);
  expect(readPreferences(f.getState())).toEqual({ ...p, reservations: {} });
  f.switchCharacter();
  expect(readPreferences(f.getState())).toEqual(defaults());
  f.setModData("afnm-profitseeker", "preferences", {
    options: { quality: -9, tier: "bad" },
    reservations: { bad: Infinity },
  });
  expect(readPreferences(f.getState()).options.quality).toBe("achieved");
  expect(readPreferences(f.getState()).reservations).toEqual({});
});
test("stock entries with different modifiers retain their own quantities and quotes",()=>{
  const f=createFixture(),state=f.getState();
  const market=obj(obj(obj(obj(state.location).locations)["Valley market"]).buildingState).market as Record<string,unknown>;
  market.items=[{name:"Moonleaf",stacks:2,valueModifier:1},{name:"Moonleaf",stacks:3,valueModifier:2}];
  const reader=new RecipeReader(f.api),w=readWorld(f.api,state,f.flags,reader,1);reader.dispose();
  const quotes=w.sources.get("Moonleaf")!.filter(s=>s.location==="Valley market");
  expect(quotes.map(s=>s.quantity)).toEqual([2,3]);
  expect(quotes[0].id).not.toBe(quotes[1].id);
  expect(quotes[0].cost).not.toEqual(quotes[1].cost);
});
