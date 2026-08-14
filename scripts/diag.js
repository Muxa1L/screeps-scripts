import 'dotenv/config';
import { ScreepsHttpClient } from 'screeps-api';

const token = process.env.SCREEPS_TOKEN;
if (!token) { console.error('No SCREEPS_TOKEN'); process.exit(1); }

const client = new ScreepsHttpClient({ token, protocol: 'https', hostname: 'screeps.com', port: 443, path: '/' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sendCmd(expr) {
  try {
    const r = await client.req('POST', '/api/user/console', { shard: 'shard3', expression: expr });
    return r;
  } catch (e) { console.error('cmd err', e.message); }
}

async function readMem() {
  try {
    const r = await client.req('GET', '/api/user/memory', { shard: 'shard3' });
    return r;
  } catch (e) { console.error('mem err', e.message); return null; }
}

async function run() {
  // Command 1: room basics
  await sendCmd(`Memory._chk={};var r=Game.rooms['W47N45'];if(!r){Memory._chk.err='NO_ROOM'}else{var c=r.controller;var s=r.storage;var sp=_.find(r.find(FIND_STRUCTURES),x=>x.structureType=='spawn');var ex=_.filter(r.find(FIND_STRUCTURES),x=>x.structureType=='extension');var tw=_.filter(r.find(FIND_STRUCTURES),x=>x.structureType=='tower');Memory._chk.b={t:Game.time,rcl:c?c.level:0,se:s?s.store.energy:0,sp:sp?sp.store.energy:0,spc:sp?sp.store.getCapacity('energy'):0,ext:_.sum(ex,'store.energy'),extc:_.sum(ex,x=>x.store.getCapacity('energy')),tw:_.sum(tw,'store.energy'),twc:_.sum(tw,x=>x.store.getCapacity('energy'))}}`);
  await sleep(9000);

  // Command 2: links
  await sendCmd(`var r=Game.rooms['W47N45'];if(r){var l=r.find(FIND_STRUCTURES,{filter:{structureType:'link'}});Memory._chk.lk=_.map(l,x=>({x:x.pos.x,y:x.pos.y,e:x.store.energy,c:x.store.getCapacity('energy'),cd:x.cooldown||0}))}`);
  await sleep(9000);

  // Command 3: creeps
  await sendCmd(`Memory._chk.cr=_.map(_.filter(Game.creeps,c=>c.room&&c.room.name=='W47N45'),c=>({n:c.name,r:(c.memory&&c.memory.role)||'?',t:(c.memory&&c.memory.task&&c.memory.task.type)||'?',e:c.store.energy,ec:c.store.getCapacity('energy'),ttl:c.ticksToLive||-1,x:c.pos.x,y:c.pos.y}))`);
  await sleep(9000);

  // Command 4: construction sites + errors
  await sendCmd(`var r=Game.rooms['W47N45'];Memory._chk.cs=r?r.find(FIND_CONSTRUCTION_SITES).length:0;Memory._chk.er=Memory.stats&&Memory.stats.errors?JSON.stringify(Memory.stats.errors):'none'`);
  await sleep(9000);

  // read memory
  const mem = await readMem();
  console.log('=== RAW MEMORY RESPONSE ===');
  console.log(JSON.stringify(mem, null, 2));
}

run().catch(e => console.error('fatal', e));
