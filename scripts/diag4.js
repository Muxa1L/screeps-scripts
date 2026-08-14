import 'dotenv/config';
import { ScreepsHttpClient } from 'screeps-api';

const token = process.env.SCREEPS_TOKEN;
const client = new ScreepsHttpClient({ token, protocol: 'https', hostname: 'screeps.com', port: 443, path: '/' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sendCmd(expr) {
  try { await client.req('POST', '/api/user/console', { shard: 'shard3', expression: expr }); }
  catch (e) { console.error('cmd err', e.message); }
}
async function readMem() {
  try { return await client.req('GET', '/api/user/memory', { shard: 'shard3' }); }
  catch (e) { console.error('mem err', e.message); return null; }
}

async function run() {
  // Dump top-level memory keys to find config structure
  await sendCmd(`Memory._memKeys=_.keys(Memory).join(',')`);
  await sleep(9000);
  await sendCmd(`Memory._memSubKeys={};_.each(['config','cfg','colony','colonies','room','rooms','creeps','creepConfig','spawn','spawner','population','quota','roles'],k=>{if(Memory[k]){Memory._memSubKeys[k]=JSON.stringify(Memory[k]).substring(0,300)}})`);
  await sleep(9000);
  // Check the W47N45 room memory specifically
  await sendCmd(`Memory._rm47=Memory.rooms&&Memory.rooms['W47N45']?JSON.stringify(Memory.rooms['W47N45']).substring(0,800):'none'`);
  await sleep(9000);
  // Check the creeps memory keys
  await sendCmd(`Memory._crMemKeys=_.keys(Memory.creeps||{}).join(',')`);
  await sleep(9000);

  const mem = await readMem();
  const d = mem?.data?.data ? JSON.parse(mem.data.data) : mem?.data;
  console.log('=== MEM KEYS ===');
  console.log(d?._memKeys);
  console.log('=== MEM SUBKEYS ===');
  console.log(JSON.stringify(d?._memSubKeys, null, 2));
  console.log('=== ROOM W47N45 MEM ===');
  console.log(d?._rm47);
  console.log('=== CREEP MEM KEYS ===');
  console.log(d?._crMemKeys);
}

run().catch(e => console.error('fatal', e));
