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
  // All creeps regardless of room, with full detail
  await sendCmd(`Memory._allCr=_.map(Game.creeps,c=>({n:c.name,r:(c.memory&&c.memory.role)||'?',ti:(c.memory&&c.memory.taskId)||null,act:(c.memory&&c.memory._action)||null,e:c.store.energy,ec:c.store.getCapacity('energy'),ttl:c.ticksToLive||-1,room:c.pos.roomName,x:c.pos.x,y:c.pos.y}))`);
  await sleep(9000);

  // Spawn status
  await sendCmd(`Memory._spStat={};var s=Game.spawns.Spawn1;if(s){Memory._spStat={name:s.name,energy:s.store.energy,cap:s.store.getCapacity('energy'),spawning:s.spawning?(s.spawning.name+':'+s.spawning.remainingTime):null,hits:s.hits}}`);
  await sleep(9000);

  // Storage history (recent values)
  await sendCmd(`Memory._stHist=[];var r=Game.rooms['W47N45'];if(r&&r.storage){var st=r.storage;Memory._stHist.push({e:st.store.energy,t:Game.time})};if(Memory.stats&&Memory.stats.storageHistory){Memory._stHist2=Memory.stats.storageHistory.slice(-10)}`);
  await sleep(9000);

  const mem = await readMem();
  const d = mem?.data?.data ? JSON.parse(mem.data.data) : mem?.data;
  console.log('=== ALL CREEPS ===');
  console.log(JSON.stringify(d?._allCr, null, 2));
  console.log('=== SPAWN STATUS ===');
  console.log(JSON.stringify(d?._spStat, null, 2));
  console.log('=== STORAGE HIST ===');
  console.log(JSON.stringify(d?._stHist, null, 2));
  console.log(JSON.stringify(d?._stHist2, null, 2));
  console.log('=== _chk (latest) ===');
  console.log(JSON.stringify(d?._chk, null, 2));
  console.log('=== ERRORS ===');
  console.log(JSON.stringify(d?.stats?.errors, null, 2));
  console.log('=== lastErrors ===');
  console.log(JSON.stringify(d?.stats?.lastErrors, null, 2));
}

run().catch(e => console.error('fatal', e));
