import { API } from './api-base.mjs';
/* Buildings: each one a separate file, one open at a time.
 *
 * Both sides of every rule — what is let through and what is refused — and
 * the one thing the whole design rests on: what is written in one building is
 * not there in the other, in either direction.
 *
 * Leaves the building it found open, open again at the end, so it can run in
 * the middle of the other suites.
 *
 *   node smoke/buildings.mjs
 */
const call = async (m, p, b) => {
  const r = await fetch(API + p, { method: m, headers: {'Content-Type':'application/json'},
    body: b === undefined ? undefined : JSON.stringify(b) });
  const body = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, body };
};
const GET = p => call('GET', p), POST = (p,b) => call('POST',p,b),
      PUT = (p,b) => call('PUT',p,b), DEL = (p,b) => call('DELETE',p,b);

let pass = 0; const findings = [];
const ok = (name, cond, detail = '') => {
  if(cond){ pass++; console.log(`  ok   ${name}`); }
  else { findings.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); }
};
const section = t => console.log(`\n${t}`);
const stamp = Date.now().toString(36);
const A = `อาคารเอ ${stamp}`, B = `อาคารบี ${stamp}`, C = `อาคารซี ${stamp}`;

const found = (await GET('/buildings')).body;
const before = found.current;

section('nothing open: the chooser works, nothing else does');
ok('close answers 204', (await POST('/buildings/close')).status === 204);
let r = await GET('/units');
ok('a building route is refused with 400', r.status === 400, String(r.status));
ok('with the code the screen goes back to the chooser on', r.body?.code === 'NO_BUILDING', JSON.stringify(r.body));
ok('settings too', (await GET('/settings')).status === 400);
ok('backups too', (await GET('/backups')).status === 400);
ok('/health still answers', (await GET('/health')).status === 200);
ok('/buildings still answers, with nothing current', (await GET('/buildings')).body?.current === null);

section('adding a building');
r = await POST('/buildings', { name: '   ' });
ok('a blank name is refused', r.status === 400, String(r.status));
const a = await POST('/buildings', { name: A });
ok('a named one is made (201)', a.status === 201, JSON.stringify(a.body));
r = await POST('/buildings', { name: `  ${A.toUpperCase()}  ` });
ok('the same name again is refused', r.status === 400, String(r.status));
ok('and the message names it', (r.body?.error || '').includes(A), r.body?.error);
const b = await POST('/buildings', { name: B });
ok('a second one is made', b.status === 201);
ok('with its own id', a.body.id !== b.body.id);
ok('making one does not open it', (await GET('/buildings')).body.current === null);

section('opening');
ok('an id that does not exist is 404', (await POST('/buildings/b99999/open')).status === 404);
ok('an id that is not an id is 404', (await POST('/buildings/..%2Fapartment/open')).status === 404);
r = await POST(`/buildings/${a.body.id}/open`);
ok('a real one opens', r.status === 200 && r.body.name === A, JSON.stringify(r.body));
ok('and is now current', (await GET('/buildings')).body.current === a.body.id);
let s = (await GET('/settings')).body;
ok('its name is the one typed', s.building_name === A, s.building_name);
ok('a new building starts on the default rate', s.water_rate === 9, String(s.water_rate));
ok('a new building starts with no rooms', (await GET('/units')).body.length === 0);
ok('with the three starter fee types', (await GET('/fees/types')).body?.length === 3);

section('nothing crosses between buildings');
r = await POST('/units', { unit_number: 'X1', floor: 1, base_rent: 3000 });
ok('a room is added in A', r.status === 201, JSON.stringify(r.body));
await PUT('/settings', { water_rate: 9 });
await POST(`/buildings/${b.body.id}/open`);
ok('B does not have it', !(await GET('/units')).body.some(u => u.unit_number === 'X1'));
ok('B has its own name', (await GET('/settings')).body.building_name === B);
await PUT('/settings', { water_rate: 12 });
await POST(`/buildings/${a.body.id}/open`);
ok('a rate changed in B is not changed in A', (await GET('/settings')).body.water_rate === 9);
ok('and A still has its room', (await GET('/units')).body.some(u => u.unit_number === 'X1'));
await POST(`/buildings/${b.body.id}/open`);
ok('and B kept its rate', (await GET('/settings')).body.water_rate === 12);

section('the card\'s colour and icon');
let look = (await GET('/buildings')).body.buildings.find(x => x.id === a.body.id);
ok('a building never given one reads as the default', look.color === 'none' && look.icon === 'building',
  `${look.color} ${look.icon}`);
r = await PUT(`/buildings/${a.body.id}/look`, { color: 'blue', icon: 'house' });
ok('a colour and an icon from the list are saved', r.status === 200 && r.body.color === 'blue' && r.body.icon === 'house',
  JSON.stringify(r.body));
r = await PUT(`/buildings/${a.body.id}/look`, { icon: 'star' });
ok('one alone leaves the other', r.body?.icon === 'star' && r.body?.color === 'blue', JSON.stringify(r.body));
r = await PUT(`/buildings/${a.body.id}/look`, { color: '#ff0000' });
ok('a colour not on the list is refused', r.status === 400, String(r.status));
r = await PUT(`/buildings/${a.body.id}/look`, { icon: 'rocket' });
ok('an icon not on the list is refused', r.status === 400, String(r.status));
ok('and neither was written', (await GET('/buildings')).body.buildings.find(x => x.id === a.body.id).color === 'blue');
ok('nothing chosen is refused', (await PUT(`/buildings/${a.body.id}/look`, {})).status === 400);
ok('a building that does not exist is 404', (await PUT('/buildings/b99999/look', { color: 'red' })).status === 404);
ok('the other building kept its own', (await GET('/buildings')).body.buildings.find(x => x.id === b.body.id).color === 'none');
await POST(`/buildings/${a.body.id}/open`);
s = (await GET('/settings')).body;
ok('it is in the building\'s own settings', s.building_color === 'blue', s.building_color);
r = await PUT('/settings', s);
ok('so reading every setting and writing it back still works', r.status === 200, r.body?.error);
r = await PUT('/settings', { building_color: 'chartreuse' });
ok('but not with a colour off the list', r.status === 400, String(r.status));
r = await POST(`/buildings/${a.body.id}/open`);
ok('the open building\'s card can be changed too', (await PUT(`/buildings/${a.body.id}/look`, { color: 'green' })).body?.color === 'green');
await POST('/buildings/close');

section('each building keeps its own backups');
await POST('/buildings/close');
const c = await POST('/buildings', { name: C });
await POST(`/buildings/${c.body.id}/open`);
r = (await GET('/backups')).body;
ok('a building opened once has exactly one copy, not another building\'s', r.count === 1, String(r.count));

section('deleting');
await POST(`/buildings/${a.body.id}/open`);
r = await DEL(`/buildings/${a.body.id}`, { name: A });
ok('the open building cannot be deleted', r.status === 400, String(r.status));
await POST('/buildings/close');
r = await DEL(`/buildings/${a.body.id}`, { name: 'อาคาร' });
ok('a name that does not match is refused', r.status === 400, String(r.status));
ok('and it is still there', (await GET('/buildings')).body.buildings.some(x => x.id === a.body.id));
r = await DEL(`/buildings/${a.body.id}`);
ok('no name at all is refused', r.status === 400, String(r.status));
r = await DEL(`/buildings/${a.body.id}`, { name: ` ${A} ` });
ok('the exact name deletes it (204)', r.status === 204, JSON.stringify(r.body));
ok('and it is gone from the list', !(await GET('/buildings')).body.buildings.some(x => x.id === a.body.id));
ok('a deleted id cannot be opened', (await POST(`/buildings/${a.body.id}/open`)).status === 404);
const d = await POST('/buildings', { name: A });
ok('its name can be used again', d.status === 201);
ok('but never its id', d.body.id !== a.body.id, `${d.body.id} vs ${a.body.id}`);
await POST(`/buildings/${d.body.id}/open`);
ok('and the new one does not have the old one\'s room', (await GET('/units')).body.length === 0);

// Clean up, and put back whatever was open.
await POST('/buildings/close');
for(const [x, name] of [[b, B], [c, C], [d, A]]) await DEL(`/buildings/${x.body.id}`, { name });
if(before) await POST(`/buildings/${before}/open`);
ok('the building that was open before is open again', (await GET('/buildings')).body.current === before);

console.log(`\n${pass} passed, ${findings.length} failed`);
if(findings.length){ console.log('\nFINDINGS:'); findings.forEach(f => console.log('  - ' + f)); }
process.exit(findings.length ? 1 : 0);
