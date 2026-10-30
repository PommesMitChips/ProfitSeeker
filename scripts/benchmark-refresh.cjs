// Reproducible adapter-work comparison using synthetic fixtures, not live FPS.
const fs = require('node:fs');
const ts = require('typescript');
const {performance} = require('node:perf_hooks');
for (const extension of ['.ts','.tsx']) require.extensions[extension] = (module, filename) => {
  const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true,resolveJsonModule:true}});
  module._compile(compiled.outputText,filename);
};
const {createFixture}=require('../harness/fixture.ts');
const {RecipeReader}=require('../src/game/api.ts');
const {readWorld}=require('../src/catalogue/readWorld.ts');
const {saveCache,updateCachedWorld}=require('../src/state/runtime.ts');
const {createProfitSelector,createFlagSelector}=require('../src/state/changes.ts');
const scenarios={
  'combat/UI event':(state)=>({...state,calendar:{day:1},player:{...state.player,player:{...state.player.player,hp:1,qi:1}}}),
  'money only':(state)=>({...state,inventory:{...state.inventory,money:600}}),
  'purchase':(_,f)=>{f.simulatePurchase();return f.getState();},
  'recipe record':(state)=>({...state,inventory:{...state.inventory,recipes:state.inventory.recipes.map((r,i)=>i===0?{...r,perfectBestResult:999}:r)}}),
  'reputation':(state)=>({...state,player:{...state.player,player:{...state.player.player,reputation:{...state.player.player.reputation,Valley:10}}}}),
};
function measure(change, incremental){
  const f=createFixture(),counts={recipeDerivations:0,priceQuotes:0,discoveryScans:0};
  for(const [method,key] of [['deriveRecipeDifficulty','recipeDerivations'],['getCharismaDiscount','priceQuotes'],['discoverUnlockedLocations','discoveryScans']]){
    const original=f.api.utils[method];f.api.utils[method]=(...args)=>{counts[key]++;return original(...args);};
  }
  const cache=saveCache(),select=createProfitSelector(),flags=createFlagSelector(f.api.gameData,f.flags);
  updateCachedWorld(cache,f.api,select(f.getState()),f.flags,flags(f.flags),'en');
  for(const key of Object.keys(counts))counts[key]=0;
  const state=change(f.getState(),f),started=performance.now();
  if(incremental)updateCachedWorld(cache,f.api,select(state),f.flags,flags(f.flags),'en');
  else {const reader=new RecipeReader(f.api);try{readWorld(f.api,state,f.flags,reader,2);}finally{reader.dispose();}}
  return {...counts,adapterMilliseconds:Number((performance.now()-started).toFixed(3))};
}
const result={scope:'Synthetic fixture adapter calls after initialization; full rebuild baseline versus incremental refresh. Not a live-game FPS benchmark.',events:Object.entries(scenarios).map(([event,change])=>({event,fullRebuild:measure(change,false),incremental:measure(change,true)}))};
console.log(JSON.stringify(result,null,2));
