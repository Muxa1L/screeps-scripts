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
  // Check console output result (the console command returns results in the response)
  const r1 = await client.req('POST', '/api/user/console', { shard: 'shard3', expression: "console.log('DIAG_TICK='+Game.time)" });
  console.log('console result 1:', JSON.stringify(r1));
  await sleep(3000);

  // Check if there's a spawn queue in the source code / memory
  await sendCmd(`Memory._srcCheck={hasConfig:typeof Config!=='undefined',hasPopulation:typeof Population!=='undefined',globalKeys:_.keys(global).filter(k=>k.indexOf('_')!==0).join(',').substring(0,500)}`);
  await sleep(9000);

  // Check the harvester's task type more carefully
  await sendCmd(`Memory._hInfo={};var h=Game.creeps['Harvester82238400-Spawn1'];if(h){Memory._hInfo={role:h.memory.role,taskId:h.memory.taskId,action:h.memory._action,taskType:h.memory.task?h.memory.task.type:null,body:h.body.map(b=>b.type).join(','),spawning:h.spawning||false}}`);
  await sleep(9000);

  // Storage energy trend: check _st values from previous diagnostics
  await sendCmd(`Memory._stTrend={cur:Game.rooms['W47N45']&&Game.rooms['W47N45'].storage?Game.rooms['W47N45'].storage.store.energy:-1,prev:_st?_st.split('|')[0]:null,prevTick:_st?_st.split('|')[1]:null,_stVal:Memory._st,_s1Val:Memory._s1}`);
  await sleep(9000);

  const mem = await readMem();
  const d = mem?.data?.data ? JSON.parse(mem.data.data) : mem?.data;
  console.log('=== SRC CHECK ===');
  console.log(JSON.stringify(d?._srcCheck, null, 2));
  console.log('=== HARVESTER INFO ===');
  console.log(JSON.stringify(d?._hInfo, null, 2));
  console.log('=== STORAGE TREND ===');
  console.log(JSON.stringify(d?._stTrend, null, 2));
}

run().catch(e => console.error('fatal', e));
