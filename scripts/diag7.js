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
  // Check the rclHistory for storage trend over time
  await sendCmd(`Memory._rclHist=Memory.stats&&Memory.stats.rclHistory?JSON.stringify(Memory.stats.rclHistory):'none'`);
  await sleep(9000);

  // Get container energy at source 1 (4,9): container at 4,8 has e=0 now but was 2000 before
  // Get container energy at source 2 (14,33): container at 13,34 has e=2000 (full)
  // Check if miner is at source 1
  await sendCmd(`Memory._minerDiag=_.map(_.filter(Game.creeps,c=>c.memory.role==='miner'),c=>({n:c.name,x:c.pos.x,y:c.pos.y,room:c.pos.roomName,e:c.store.energy,ttl:c.ticksToLive,taskId:c.memory.taskId}))`);
  await sleep(9000);

  // Check the previous diagnostics with timestamps to understand storage drain
  // _st = "storage=96922|tick=82009238" → tick 82009238 had 96922 energy
  // _a = "tick=82237174|...|storage=0" → tick 82237174 had 0
  // That's a drop from 96922 to 0 over ~228000 ticks (~19 hours at 3.3 ticks/sec)
  // Let's check intermediate values
  await sendCmd(`Memory._stCheck=Memory._st?Memory._st:'none';Memory._aCheck=Memory._a?'none';Memory._ldCheck=Memory._ld||'none'`);
  await sleep(9000);

  // Check the link network: link at 3,8 (near source 1 at 4,9) has 0 energy
  // link at 24,17 (near storage at 26,19) has 0 energy
  // The _ld diagnostic showed: "3,8:e=800:isSrc=true:cd=0" and "24,17:e=6:isSrc=false:cd=0" at some earlier point
  // So the source link was filling (800) and storage link was draining (6)
  // But now both are 0 - need to check if links are being used
  await sendCmd(`Memory._linkDiag2=[];var r=Game.rooms['W47N45'];if(r){r.find(FIND_STRUCTURES,{filter:{structureType:'link'}}).forEach(l=>{Memory._linkDiag2.push({x:l.pos.x,y:l.pos.y,e:l.store.energy,c:l.store.getCapacity('energy'),cd:l.cooldown,near:l.pos.findInRange(FIND_STRUCTURES,3).filter(s=>s.structureType!=='link').map(s=>s.structureType).join(',')})})}`);
  await sleep(9000);

  const mem = await readMem();
  const d = mem?.data?.data ? JSON.parse(mem.data.data) : mem?.data;
  console.log('=== RCL HISTORY ===');
  console.log(d?._rclHist);
  console.log('=== MINER DIAG ===');
  console.log(JSON.stringify(d?._minerDiag, null, 2));
  console.log('=== LINK DIAG 2 ===');
  console.log(JSON.stringify(d?._linkDiag2, null, 2));
}

run().catch(e => console.error('fatal', e));
