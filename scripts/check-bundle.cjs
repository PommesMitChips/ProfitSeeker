const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const bundle = fs.readFileSync(
  require("node:path").join(__dirname, "../dist/afnm-profitseeker/mod.js"),
  "utf8",
);
const tabs = [];
const injections = [];
const host = {
  console,
  React: { createElement() {}, createContext() { return {}; } },
  MaterialUI: {},
  modAPI: {
    injectUI: (slot, generator) => injections.push({slot,generator}),
    actions: { addTab: (slot, config) => tabs.push({ slot, config }) },
  },
};
host.window = host;
const ctx = vm.createContext(host);
vm.runInContext(bundle, ctx, { timeout: 2000 });
assert.equal(host.AFNMMod.getMetadata().name, "Profit Seeker");
assert.equal(tabs.length, 0, "The mod must not register an inventory tab");
assert.equal(injections.length, 1);
assert.equal(injections[0].slot, 'player-ui');
const inserted=[];
injections[0].generator({},(...args)=>inserted.push(args));
assert.equal(inserted.length,1);
assert.equal(inserted[0][0],'');
vm.runInContext(bundle, ctx, { timeout: 2000 });
assert.equal(tabs.length, 0, "Reload must not register an inventory tab");
assert.equal(injections.length, 1, "Reload must not duplicate the floating launcher");
console.log(
  "Bundle smoke check passed: AFNMMod metadata, one floating launcher and no inventory tab.",
);
const path=require('node:path');
const zip=fs.readFileSync(path.join(__dirname,'../builds/Profit Seeker.zip'));
const files=new Map();
let offset=0;
while(zip.readUInt32LE(offset)===0x04034b50){
  assert.equal(zip.readUInt16LE(offset+8),0,'Shipping ZIP uses stored entries');
  const length=zip.readUInt32LE(offset+18),nameLength=zip.readUInt16LE(offset+26),extraLength=zip.readUInt16LE(offset+28);
  const name=zip.subarray(offset+30,offset+30+nameLength).toString('utf8');
  const start=offset+30+nameLength+extraLength;
  assert.ok(!files.has(name),'No duplicate archive entries');
  files.set(name,zip.subarray(start,start+length).toString('utf8'));
  offset=start+length;
}
assert.equal(zip.readUInt32LE(offset),0x02014b50,'Central directory follows file entries');
assert.deepEqual([...files.keys()].sort(),['LICENSE','mod.js','package.json']);
assert.equal(files.get('mod.js'),bundle);
assert.equal(files.get('LICENSE'),fs.readFileSync(path.join(__dirname,'../LICENSE'),'utf8'));
const manifest=JSON.parse(files.get('package.json'));
assert.equal(manifest.name,'afnm-profitseeker');assert.equal(manifest.main,'mod.js');
assert.equal(manifest.license,'MIT');
console.log('Archive check passed: exact shipping file list and byte-identical bundle.');
