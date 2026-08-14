'use strict';
require('dotenv').config();
const { ScreepsHttpClient } = require('screeps-api');
const ROOM = 'W47N45';
const SHARD = 'shard3';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function main() {
  const token = process.env.SCREEPS_TOKEN;
  if (!token) { console.error("No SCREEPS_TOKEN"); process.exit(1); }
  const client = new ScreepsHttpClient({ hostname: "screeps.com", port: 443, protocol: "https", path: "/", token: token });
  async function cmd(expr) { try { return await client.req("POST", "/api/user/console", { shard: SHARD, expression: expr }); } catch(e) { console.error("CMD ERR:", e.message); return null; } }
  async function readMem(p) { try { return await client.req("GET", "/api/user/memory", { shard: SHARD, path: p }); } catch(e) { console.error("READ ERR:", e.message); return null; } }
  console.log("=== Health Check: " + ROOM + " on " + SHARD + " ===");
  var c1 = "var r=Game.rooms['" + ROOM + "'];Memory._chk={b:{t:Game.time,rcl:r.controller?r.controller.level:0,sp:r.find(FIND_MY_SPAWNS).map(function(s){return{n:s.name,e:s.store[RESOURCE_ENERGY],c:s.store.getCapacity(RESOURCE_ENERGY)}}),st:r.storage?r.storage.store[RESOURCE_ENERGY]:-1,ex:{t:_.sum(r.find(FIND_STRUCTURES,{filter:{structureType:STRUCTURE_EXTENSION}}).map(function(e){return e.store[RESOURCE_ENERGY]})),c:_.sum(r.find(FIND_STRUCTURES,{filter:{structureType:STRUCTURE_EXTENSION}}).map(function(e){return e.store.getCapacity(RESOURCE_ENERGY)}))},tw:{t:_.sum(r.find(FIND_STRUCTURES,{filter:{structureType:STRUCTURE_TOWER}}).map(function(t){return t.store[RESOURCE_ENERGY]})),c:_.sum(r.find(FIND_STRUCTURES,{filter:{structureType:STRUCTURE_TOWER}}).map(function(t){return t.store.getCapacity(RESOURCE_ENERGY)}))}}}";
  console.log("[CMD1] Room basics..."); await cmd(c1); await sleep(9000);
  var c2 = "var r=Game.rooms['" + ROOM + "'];Memory._chk.l=r.find(FIND_STRUCTURES,{filter:{structureType:STRUCTURE_LINK}}).map(function(l){return{x:l.pos.x,y:l.pos.y,e:l.store[RESOURCE_ENERGY],c:l.store.getCapacity(RESOURCE_ENERGY),cd:l.cooldown}});";
  console.log("[CMD2] Links..."); await cmd(c2); await sleep(9000);
  var c3 = "Memory._chk.c=_.filter(Game.creeps,function(c){return c.pos.roomName=='" + ROOM + "'||c.memory.home=='" + ROOM + "'}).map(function(c){return{n:c.name,r:c.memory.role,t:c.memory.task?c.memory.task.type:null,e:c.store[RESOURCE_ENERGY],c:c.store.getCapacity(RESOURCE_ENERGY),ttl:c.ticksToLive,x:c.pos.x,y:c.pos.y,rm:c.pos.roomName}});";
  console.log("[CMD3] Creeps..."); await cmd(c3); await sleep(9000);
  var c4 = "var r=Game.rooms['" + ROOM + "'];Memory._chk.cs=r.find(FIND_CONSTRUCTION_SITES).length;Memory._chk.err=Memory.stats&&Memory.stats.errors?Memory.stats.errors:null;";
  console.log("[CMD4] Construction+errors..."); await cmd(c4); await sleep(10000);
  console.log("--- Reading Memory._chk ---");
  var memRes = await readMem("");
  var data = null;
  if (memRes && memRes.data) {
    if (typeof memRes.data === "string") { try { data = JSON.parse(memRes.data); } catch(e) { console.error("Parse err:", e.message, memRes.data.substring(0,300)); } }
    else if (memRes.data.data) { if (typeof memRes.data.data === "string") { try { data = JSON.parse(memRes.data.data); } catch(e) { data = memRes.data.data; } } else data = memRes.data.data; }
    else data = memRes.data;
  }
  if (!data) { console.error("FAILED. Raw:", JSON.stringify(memRes,null,2)); process.exit(1); }
  console.log(""); console.log("========================================");
  console.log("  COLONY DIAGNOSTIC: " + ROOM + " (shard " + SHARD + ")");
  console.log("========================================"); console.log("");
  var b = data.b || {};
  console.log("--- Room Basics ---");
  console.log("  Tick: " + (b.t!==undefined?b.t:"N/A"));
  console.log("  RCL: " + (b.rcl!==undefined?b.rcl:"N/A"));
  console.log("  Storage: " + (b.st!==undefined?b.st:"N/A") + (b.st===-1?" (no storage)":" energy"));
  if (b.sp && b.sp.length) b.sp.forEach(function(s){ console.log("  Spawn "+s.n+": "+s.e+"/"+s.c+" energy"); }); else console.log("  Spawns: none");
  if (b.ex) console.log("  Extensions: "+(b.ex.t||0)+"/"+(b.ex.c||0)+" energy");
  if (b.tw) console.log("  Towers: "+(b.tw.t||0)+"/"+(b.tw.c||0)+" energy");
  console.log("");
  console.log("--- Links ---");
  if (data.l && data.l.length) data.l.forEach(function(l){ console.log("  ("+l.x+","+l.y+") energy="+l.e+"/"+l.c+" cd="+l.cd); }); else console.log("  No links");
  console.log("");
  console.log("--- Creeps ---");
  var byRole = {};
  if (data.c && data.c.length) data.c.forEach(function(c){ var role=c.r||"unknown"; byRole[role]=(byRole[role]||0)+1; var ttlW=(c.ttl!=null&&c.ttl<200)?" *** LOW TTL":""; var idleW=(!c.t)?" *** NO TASK":""; console.log("  "+c.n+" | role="+(c.r||"?")+" task="+(c.t||"NONE")+" e="+c.e+"/"+c.c+" ttl="+c.ttl+" pos="+c.rm+"("+c.x+","+c.y+")"+ttlW+idleW); }); else console.log("  No creeps!");
  console.log(""); console.log("  By role:");
  Object.keys(byRole).forEach(function(r){ console.log("    "+r+": "+byRole[r]); });
  console.log("");
  console.log("--- Construction ---"); console.log("  Sites: "+(data.cs!==undefined?data.cs:"N/A"));
  console.log("");
  console.log("--- Errors ---");
  if (data.err) console.log("  "+JSON.stringify(data.err)); else console.log("  None/not tracked");
  console.log("");
  console.log("===JSON_BEGIN===");
  console.log(JSON.stringify(data));
  console.log("===JSON_END===");
}
main().catch(function(err){ console.error("FATAL:",err); process.exit(1); });