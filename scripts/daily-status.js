require('dotenv').config();
const { ScreepsHttpClient } = require('screeps-api');
const client = new ScreepsHttpClient({
  hostname: 'screeps.com', port: 443, protocol: 'https', path: '/',
  token: process.env.SCREEPS_TOKEN,
});
async function run() {
  const res = await client.req('POST', '/api/user/console', { shard: 'shard3',
    expression:
      "var r=Game.rooms['W47N45'];var c=r.controller;" +
      "var counts={};var ttd=c.ticksToDowngrade;" +
      "for(var n in Game.creeps){var cr=Game.creeps[n];if(cr.room.name==='W47N45'){var ro=cr.memory.role||'?';counts[ro]=(counts[ro]||0)+1}};" +
      "var links=r.find(FIND_STRUCTURES,{filter:function(s){return s.structureType===STRUCTURE_LINK}});" +
      "var sl=[];for(var i=0;i<links.length;i++){var l=links[i];sl.push(l.pos.x+','+l.pos.y+'='+l.energy+'/'+l.energyCapacity)};" +
      "var sites=r.find(FIND_CONSTRUCTION_SITES);var stypes={};for(var j=0;j<sites.length;j++){stypes[sites[j].structureType]=(stypes[sites[j].structureType]||0)+1};" +
      "Memory._d='ctrl='+Math.floor(c.progress/1000)+'k/'+Math.floor(c.progressTotal/1000)+'k('+Math.floor(c.progress*100/c.progressTotal)+'%)|ttd='+ttd+'|up='+(counts.upgrader||0)+'|b='+(counts.builder||0)+'|h='+(counts.hauler||0)+'|d='+(counts.distributor||0)+'|m='+(counts.miner||0)+'|storage='+(r.storage?r.storage.store.energy:'none')+'|links='+sl.join(' ')+'|sites='+JSON.stringify(stypes)" });
  await new Promise(r => setTimeout(r, 12000));
  const mem = await client.req('GET', '/api/user/memory', { shard: 'shard3' });
  const data = typeof mem === 'string' ? JSON.parse(mem) : mem;
  const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
  console.log(parsed._d);
}
run().catch(e => console.error(e.message));
