// Colony health diagnostic for Screeps shard3, room W47N45.
import 'dotenv/config';
import { ScreepsHttpClient } from 'screeps-api';

const ROOM = 'W47N45';
const SHARD = 'shard3';
const TOKEN = process.env.SCREEPS_TOKEN;
if (!TOKEN) { console.error('SCREEPS_TOKEN missing'); process.exit(1); }

const client = new ScreepsHttpClient({
  server: { token: TOKEN, url: 'https://screeps.com/' },
  app: {},
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendConsole(expression) {
  return await client.req('POST', '/api/user/console', { shard: SHARD, expression });
}
const R = ROOM;
const exprTick = "Memory._chk=Memory._chk||{};Memory._chk.t=Game.time;var c=Game.rooms['"+R+"']&&Game.rooms['"+R+"'].controller;Memory._chk.rcl=c?c.level:null;Memory._chk.ttd=c?c.ticksToDowngrade:null;var st=Game.rooms['"+R+"']&&Game.rooms['"+R+"'].storage;Memory._chk.st=st?st.store.energy:null;Memory._chk.stc=st?st.store.getCapacity(RESOURCE_ENERGY):null";

const exprSpawn = "Memory._chk=Memory._chk||{};Memory._chk.sp=_.map(Game.rooms['"+R+"'].find(FIND_MY_SPAWNS),function(s){return {n:s.name,e:s.store.energy,c:s.storeCapacity,s:s.spawning?1:0}});Memory._chk.ex=_.reduce(Game.rooms['"+R+"'].find(FIND_MY_STRUCTURES,{filter:{structureType:STRUCTURE_EXTENSION}},function(a,e){return a+e.store.energy},0));Memory._chk.exc=_.reduce(Game.rooms['"+R+"'].find(FIND_MY_STRUCTURES,{filter:{structureType:STRUCTURE_EXTENSION}},function(a,e){return a+e.storeCapacity},0))";

const exprTowers = "Memory._chk=Memory._chk||{};Memory._chk.tw=_.map(Game.rooms['"+R+"'].find(FIND_MY_STRUCTURES,{filter:{structureType:STRUCTURE_TOWER}},function(t){return {e:t.store.energy,c:t.storeCapacity}}))";

const exprLinks = "Memory._chk=Memory._chk||{};Memory._chk.lk=_.map(Game.rooms['"+R+"'].find(FIND_MY_STRUCTURES,{filter:{structureType:STRUCTURE_LINK}},function(l){return {x:l.pos.x,y:l.pos.y,e:l.store.energy,c:l.storeCapacity,cd:l.cooldown}}))";

const exprCreeps = "Memory._chk=Memory._chk||{};Memory._chk.cr=_.map(Game.rooms['"+R+"'].find(FIND_MY_CREEPS),function(c){return {n:c.name,r:c.memory.role||'?',a:c.memory._action||'',ti:c.memory.taskId||'',e:_.sum(c.carry),c:c.carryCapacity,ttl:c.ticksToLive,x:c.pos.x,y:c.pos.y}})";

const exprSites = "Memory._chk=Memory._chk||{};Memory._chk.cs=Game.rooms['"+R+"'].find(FIND_CONSTRUCTION_SITES).length";

const exprErrors = "Memory._chk=Memory._chk||{};Memory._chk.err=Memory.stats&&Memory.stats.errors?JSON.stringify(Memory.stats.errors):null;Memory._chk.lerr=Memory.stats&&Memory.stats.lastErrors?JSON.stringify(Memory.stats.lastErrors):null";
const QUOTAS = {
  0:{},1:{harvester:3,upgrader:1},2:{harvester:5,upgrader:2},
  3:{miner:2,hauler:3,distributor:2,upgrader:3,builder:1},
  4:{miner:2,hauler:2,distributor:3,upgrader:3,builder:2},
  5:{miner:2,hauler:1,distributor:2,upgrader:3,builder:2},
  6:{miner:2,hauler:4,distributor:3,upgrader:3,builder:2},
  7:{miner:2,hauler:5,distributor:3,upgrader:3,builder:2},
  8:{miner:2,hauler:6,distributor:4,upgrader:3,builder:2},
};

async function run() {
  console.log('=== Screeps colony diagnostic ===');
  console.log('Room: '+ROOM+'  Shard: '+SHARD);
  console.log();

  try {
    const me = await client.req('GET', '/api/auth/me', {});
    console.log('Authenticated as:', me.username || me._id || '(ok)');
  } catch (e) {
    console.error('Auth check failed:', e.message || e);
    process.exit(1);
  }

  const exprs = [
    ['tick/rcl/storage', exprTick],
    ['spawn/extensions', exprSpawn],
    ['towers', exprTowers],
    ['links', exprLinks],
    ['creeps', exprCreeps],
    ['sites', exprSites],
    ['errors', exprErrors],
  ];

  for (const [label, expr] of exprs) {
    try {
      const r = await sendConsole(expr);
      if (r && r.ok === 0 && r.error) {
        console.error('  [console:'+label+'] API error:', r.error);
      }
    } catch (e) {
      console.error('  [console:'+label+'] throw:', e.message || e);
    }
    await sleep(1200);
  }

  await sleep(10000);

  let chk;
  try {
    const raw = await client.req('GET', '/api/user/memory', { shard: SHARD, path: '_chk' });
    let d = raw && raw.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) {} }
    chk = d;
  } catch (e) {
    console.error('Failed to read Memory._chk:', e.message || e);
    process.exit(1);
  }

  if (!chk) {
    console.error('Memory._chk is empty/null.');
    process.exit(1);
  }

  console.log('--- Raw Memory._chk ---');
  console.log(JSON.stringify(chk, null, 2));
  console.log();

  const tick = chk.t, rcl = chk.rcl, storage = chk.st, storageCap = chk.stc, ttd = chk.ttd;
  const spawns = chk.sp || [], extE = chk.ex, extC = chk.exc;
  const towers = chk.tw || [], links = chk.lk || [], creeps = chk.cr || [];
  const sites = chk.cs, errors = chk.err, lastErrors = chk.lerr;
  console.log('=== Анализ ===');
  console.log('Тик: '+tick);
  console.log('RCL: '+(rcl!=null?rcl:'?')+' (ttd: '+(ttd!=null?ttd:'?')+')');
  console.log('Склад: '+(storage!=null?storage:'?')+'/'+(storageCap!=null?storageCap:'?'));
  if (storage!=null && storageCap!=null && storageCap>0) {
    console.log('  заполнение: '+((storage/storageCap)*100).toFixed(1)+'%');
  }
  console.log('Экстеншены: '+(extE!=null?extE:'?')+'/'+(extC!=null?extC:'?'));
  console.log('Спавны:');
  for (const s of spawns) {
    console.log('  '+s.n+': энергия='+s.e+'/'+s.c+' '+(s.s?'занят':'свободен'));
  }
  console.log('Башни ('+towers.length+'):');
  for (const t of towers) {
    const pct = t.c>0?((t.e/t.c)*100).toFixed(0):'?';
    console.log('  энергия='+t.e+'/'+t.c+' ('+pct+'%)');
  }
  console.log('Линки ('+links.length+'):');
  for (const l of links) {
    const pct = l.c>0?((l.e/l.c)*100).toFixed(0):'?';
    console.log('  ('+l.x+','+l.y+') энергия='+l.e+'/'+l.c+' ('+pct+'%) cd='+l.cd);
  }
  console.log('Стройплощадки: '+(sites!=null?sites:'?'));

  const byRole = {};
  const lowTtl = [], idle = [];
  for (const c of creeps) {
    byRole[c.r] = (byRole[c.r]||0)+1;
    if (c.ttl!=null && c.ttl<200) lowTtl.push(c);
    if (!c.a && !c.ti) idle.push(c);
  }
  console.log();
  console.log('Крипы (всего '+creeps.length+'):');
  console.log('  по ролям: '+JSON.stringify(byRole));
  const expected = QUOTAS[rcl] || {};
  console.log('  квота RCL'+rcl+': '+JSON.stringify(expected));
  const missing = [];
  for (const [role, n] of Object.entries(expected)) {
    const have = byRole[role]||0;
    if (have < n) missing.push(role+': '+have+'/'+n);
  }
  if (missing.length) console.log('  НЕДОСТАЁТ: '+missing.join(', '));
  else console.log('  квота выполнена');
  const extraRoles = Object.keys(byRole).filter(r=>!expected[r]);
  if (extraRoles.length) console.log('  доп. роли: '+extraRoles.map(r=>r+'='+byRole[r]).join(', '));

  if (lowTtl.length) {
    console.log();
    console.log('ВНИМАНИЕ: Крипы с TTL<200:');
    for (const c of lowTtl) console.log('  '+c.n+' ['+c.r+'] ttl='+c.ttl+' ('+c.x+','+c.y+') '+(c.a||'-'));
  }
  if (idle.length) {
    console.log();
    console.log('ВНИМАНИЕ: Крипы без задачи (idle):');
    for (const c of idle) console.log('  '+c.n+' ['+c.r+'] ('+c.x+','+c.y+') энергия='+c.e+'/'+c.c);
  }

  console.log();
  if (errors && errors !== 'null') {
    console.log('ВНИМАНИЕ: Ошибки: '+errors);
    if (lastErrors && lastErrors !== 'null') console.log('  последние: '+lastErrors);
  } else {
    console.log('Ошибок нет');
  }
  console.log();
  console.log('=== Диагностика завершена ===');
}

run().catch(e=>{ console.error('Fatal:', e); process.exit(1); });
