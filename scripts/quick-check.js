require('dotenv').config();
const { ScreepsHttpClient } = require('screeps-api');
const client = new ScreepsHttpClient({
  hostname: 'screeps.com', port: 443, protocol: 'https', path: '/',
  token: process.env.SCREEPS_TOKEN,
});
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function cmd(expr) {
  await client.req('POST', '/api/user/console', { shard: 'shard3', expression: expr });
  await sleep(8000);
  let mem = await client.req('GET', '/api/user/memory', { shard: 'shard3' });
  let data = typeof mem === 'string' ? JSON.parse(mem) : mem;
  let parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
  return parsed;
}
async function run() {
  const p = await cmd("var r=Game.rooms['W47N45'];var s=r.find(FIND_MY_SPAWNS)[0];var ex=r.find(FIND_MY_STRUCTURES,{filter:function(s){return s.structureType===STRUCTURE_EXTENSION}});var tw=r.find(FIND_MY_STRUCTURES,{filter:function(s){return s.structureType===STRUCTURE_TOWER}});var lk=r.find(FIND_MY_STRUCTURES,{filter:function(s){return s.structureType===STRUCTURE_LINK}});Memory._a='tick='+Game.time+'|rcl='+r.controller.level+'|ctrl='+Math.floor(r.controller.progress)+'/'+r.controller.progressTotal+'|spawn='+s.energy+'/'+s.energyCapacity+'|spawning='+(s.spawning?s.spawning.name:'idle')+'|storage='+r.storage.store.energy+'|exts='+ex.reduce(function(a,s){return a+s.energy},0)+'/'+ex.reduce(function(a,s){return a+s.energyCapacity},0)+'|towers='+tw.reduce(function(a,s){return a+s.energy},0)+'/'+tw.reduce(function(a,s){return a+s.energyCapacity},0)+'|links=';for(var i=0;i<lk.length;i++)Memory._a+=lk[i].pos.x+','+lk[i].pos.y+'='+lk[i].store.energy+'/'+lk[i].store.getCapacity(RESOURCE_ENERGY)+' cd='+lk[i].cooldown+' '");
  console.log('status:', p._a);
  const p2 = await cmd("Memory._b=[];for(var n in Game.creeps){var c=Game.creeps[n],m=c.memory;Memory._b.push(m.role+':e='+c.store.energy+'/'+c.store.getCapacity()+':ttl='+(c.ticksToLive||0)+':'+(m.taskId||'none').split(':')[0]+':'+c.pos.x+','+c.pos.y)}");
  if (p2._b) { for (const c of p2._b) console.log('creep:', c); console.log('total:', p2._b.length); }
  const p3 = await cmd("Memory._e=JSON.stringify(Memory.stats?Memory.stats.errors:{})");
  console.log('errors:', p3._e);
}
run().catch(e => console.error(e.message, e.stack));