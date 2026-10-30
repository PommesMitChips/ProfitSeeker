import { arbitrageRows } from '../src/planner/arbitrage';
import { selectMarkets } from '../src/query/markets';
import { buy,item,world } from './helpers';
test('both modes exclude unknown locations and restrict both sides to selected markets',()=>{
  const i=item('Ore'),a={...buy('Ore',5,4,'a'),marketId:'a'},b={...buy('Ore',1,4,'b'),marketId:'b'};
  const w=world([i],[],[a,b]);
  w.markets=[{id:'a',name:'A',known:true,availability:'available',bonus:0,multiplier:1,raw:{}},{id:'b',name:'B',known:false,availability:'available',bonus:9,multiplier:1,raw:{}}];
  expect(selectMarkets(w).markets.map(m=>m.id)).toEqual(['a']);
  expect(selectMarkets(w).sources.get('Ore')).toEqual([a]);
  expect(selectMarkets(w,[]).sources.get('Ore')).toEqual([]);
  expect(arbitrageRows(selectMarkets(w))[0].alternatives.every(a=>a.quote.market==='A')).toBe(true);
});
test('arbitrage ranks valid in-stock routes, preserves purchased variant and ignores knowledge sales',()=>{
  const i=item('Ore');const s={...buy('Ore',10,7,'buy'),marketId:'market',stockItem:{...i.raw,harmonyAugment:{type:'forge',quality:3}}};
  const w=world([i],[],[s,{...s,id:'empty',quantity:0,cost:{state:'value' as const,value:0}},{...s,id:'unknown',availability:'unknown' as const,cost:{state:'value' as const,value:1}},{...s,id:'knowledge',acquires:'knowledge' as const}]);
  w.markets.push({...w.markets[0],id:'high',name:'Higher sale',bonus:2});
  const r=arbitrageRows(w)[0];
  expect(r.offers).toHaveLength(1);expect(r.alternatives).toHaveLength(2);
  expect(r.route?.id).toBe('buy');expect(r.alternatives[0].quote.market).toBe('Higher sale');
  expect(r.item.raw.harmonyAugment).toEqual({type:'forge',quality:3});
  expect(r.alternatives[0].profit).toBe(r.alternatives[0].sale-10);
  expect(r.alternatives[0].roi).toBe(r.alternatives[0].profit/10*100);
});
test('different stock stars stay separate and no verified price does not imply profit',()=>{
  const i=item('Ore');const w=world([i],[],[0,3].map(q=>({...buy('Ore',10,1,String(q)),stockItem:{...i.raw,harmonyAugment:{type:'forge',quality:q}}})));
  expect(arbitrageRows(w)).toHaveLength(2);w.pricingVerified=false;
  expect(arbitrageRows(w).every(r=>r.profit.state!=='value')).toBe(true);
});
