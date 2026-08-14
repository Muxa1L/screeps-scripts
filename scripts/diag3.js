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
  // Force spawn of a creep to see if the system responds
  await sendCmd(`Memory._crList=_.keys(Game.creeps).join(',')`);
  await sleep(9000);
  await sendCmd(`Memory._spawnLog=[];var s=Game.spawns.Spawn1;if(s){Memory._spawnLog.push({energy:s.store.energy,cap:s.store.getCapacity('energy'),spawning:s.spawning?1:0,hits:s.hits,room:s.room.name});if(s.spawning){var sp=s.spawning;Memory._spawnLog.push({name:sp.name,need:sp.needTime,rem:sp.remainingTime})}}`);
  await sleep(9000);
  // Check memory for creep counts by role, including ALL creeps in memory
  await sendCmd(`Memory._crByRole={};_.each(Game.creeps,c=>{var r=(c.memory&&c.memory.role)||'?';Memory._crByRole[r]=(Memory._crByRole[r]||0)+1})`);
  await sleep(9000);
  // Check all structures counts in the room
  await sendCmd(`var r=Game.rooms['W47N45'];if(r){Memory._structCount={};r.find(FIND_STRUCTURES).forEach(s=>{Memory._structCount[s.structureType]=(Memory._structCount[s.structureType]||0)+1})}`);
  await sleep(9000);
  // Check if there's a spawn queue / creeps config in Memory
  await sendCmd(`Memory._cfgDump={quota:Memory.config&&Memory.config.quota?Memory.config.quota:null,creeps:Memory.config&&Memory.config.creeps?JSON.stringify(Memory.config.creeps).substring(0,500):null,population:Memory.population?JSON.stringify(Memory.population).substring(0,500):null,spawnQueue:Memory.spawnQueue?JSON.stringify(Memory.spawnQueue).substring(0,500):null,creepConfig:Memory.creepConfig?JSON.stringify(Memory.creepConfig).substring(0,500):null}`);
  await sleep(9000);

  const mem = await readMem();
  const d = mem?.data?.data ? JSON.parse(mem.data.data) : mem?.data;
  console.log('=== CREEP LIST (names) ===');
  console.log(d?._crList);
  console.log('=== CREEPS BY ROLE ===');
  console.log(JSON.stringify(d?._crByRole, null, 2));
  console.log('=== SPAWN LOG ===');
  console.log(JSON.stringify(d?._spawnLog, null, 2));
  console.log('=== STRUCT COUNT ===');
  console.log(JSON.stringify(d?._structCount, null, 2));
  console.log('=== CFG DUMP ===');
  console.log(JSON.stringify(d?._cfgDump, null, 2));
}

run().catch(e => console.error('fatal', e));
