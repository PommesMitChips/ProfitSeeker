const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  pkg = require("../package.json");
const dist = path.join(root, "dist", pkg.name),
  builds = path.join(root, "builds");
fs.mkdirSync(builds, { recursive: true });
fs.writeFileSync(
  path.join(dist, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      author: pkg.author,
      license: pkg.license,
      main: "mod.js",
    },
    null,
    2,
  ),
);
const zip = path.join(builds, "Profit Seeker.zip");
fs.copyFileSync(path.join(root, "LICENSE"), path.join(dist, "LICENSE"));
// Small deterministic, uncompressed ZIP: no shell, native module or build-time
// dependency. Only explicitly named shipping files enter the archive.
const shippingFiles = ["mod.js", "package.json", "LICENSE"];
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const local = [],
  central = [];
let offset = 0;
for (const filename of shippingFiles) {
  const name = Buffer.from(filename),
    data = fs.readFileSync(path.join(dist, filename)),
    crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, data);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt16LE(0x800, 8);
  directory.writeUInt16LE(33, 14);
  directory.writeUInt32LE(crc, 16);
  directory.writeUInt32LE(data.length, 20);
  directory.writeUInt32LE(data.length, 24);
  directory.writeUInt16LE(name.length, 28);
  directory.writeUInt32LE(offset, 42);
  central.push(directory, name);
  offset += header.length + name.length + data.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(shippingFiles.length, 8);
end.writeUInt16LE(shippingFiles.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
fs.writeFileSync(zip, Buffer.concat([...local, directory, end]));
console.log("Packaged " + zip);
