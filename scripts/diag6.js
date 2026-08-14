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
  // Get storage trend data from historical diag entries
  await sendCmd(`Memory._trend={st:Memory._st||'none',s1:Memory._s1||'none',a:Memory._a||'none',stHist:Memory._stHist||'none',chk2stE:Memory._chk2&&Memory._chk2.stE,chk2spE:Memory._chk2&&Memory._chk2.spE}`);
  await sleep(9000);

  // Get full source code module info to understand the AI architecture
  await sendCmd(`Memory._modInfo=typeof require!=='undefined'?_.keys(require.cache).filter(k=>k.indexOf('main')>=0||k.indexOf('role')>=0||k.indexOf('spawn')>=0||k.indexOf('population')>=0).join(','):'no_require'`);
  await sleep(9000);

  // Check container energy near sources (are miners filling containers?)
  await sendCmd(`var r=Game.rooms['W47N45'];if(r){Memory._srcDiag=r.find(FIND_SOURCES).map(s=>{var c=s.pos.findInRange(FIND_STRUCTURES,2,{filter:{structureType:'container'}});return {id:s.id,x:s.pos.x,y:s.pos.y,containers:c.map(x=>({x:x.pos.x,y:x.pos.y,e:x.store.energy}))}})}`);
  await sleep(9000);

  // Check the claimer status - is it stuck?
  await sendCmd(`Memory._claimDiag={};var c=Game.creeps['Claimer82238668-Spawn1'];if(c){Memory._claimDiag={pos:c.pos.roomName+':'+c.pos.x+','+c.pos.y,ttl:c.ticksToLive,fatigue:c.fatigue,action:c.memory._action,taskId:c.memory.taskId,moveFailures:c.memory._moveFailures,lastMoveResult:c.memory._lastMoveResult}}`);
  await sleep(9000);

  const mem = await readMem();
  const d = mem?.data?.data ? JSON.parse(mem.data.data) : mem?.data;
  console.log('=== TREND ===');
  console.log(JSON.stringify(d?._trend, null, 2));
  console.log('=== MOD INFO ===');
  console.log(d?._modInfo);
  console.log('=== SOURCE DIAG ===');
  console.log(JSON.stringify(d?._srcDiag, null, 2));
  console.log('=== CLAIMER DIAG ===');
  console.log(JSON.stringify(d?._claimDiag, null, 2));
}

run().catch(e => console.error('fatal', e));
