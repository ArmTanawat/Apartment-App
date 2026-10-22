/* เลือกตึก, from the screen.
 *
 * Launch with one building goes straight into it; launch with more asks.
 * เปลี่ยนตึก sits beside ✎ on the board and shows only while editing. The
 * program is "launched" by closing whatever is open on the server and
 * rendering the app afresh (remount), which is what the desktop app does.
 *
 * Starts with only the runner's building, and ends with it open again.
 *
 *   npx vite build --ssr smoke/chooser.jsx --outDir smoke-dist
 *   node smoke-dist/chooser.js
 */
import { API } from './api-base.mjs';

const before = await (await fetch(`${API}/buildings`)).json();
const original = before.buildings.find(b => b.id === before.current);
await fetch(`${API}/buildings/close`, { method: 'POST' });

const { $, $$, body, byText, check, click, done, nav, remount, section, settle, text, type } =
  await import('./harness.jsx');

const NAME = `ตึกหน้าจอ ${Date.now().toString(36)}`;
const card = name => $$('.bcard').find(r => r.querySelector('.bname')?.textContent === name);
const btn = (label, ctx = document) => $$('.btn', ctx).find(b => b.textContent === label);
const tool = (name, label) => card(name)?.querySelector(`.btool[aria-label="${label}"]`);
const server = async () => (await fetch(`${API}/buildings`)).json();
const switchButton = () => byText('.head .tools .btn', 'เปลี่ยนตึก');
const launch = async () => { await fetch(`${API}/buildings/close`, { method: 'POST' }); await remount(); };
const switchBuilding = async () => {
  await nav('ห้องพัก');
  if(!$('.head .iconbtn.on')) await click($('.head .iconbtn'));
  await click(switchButton(), 400);
};

section('one building: launch goes straight into it');
check('only one building exists', before.buildings.length === 1, String(before.buildings.length));
check('no chooser, the board', text('h1') === 'ห้องพัก', text('h1'));
check('of that building', $('.brand span')?.textContent === original.name, $('.brand span')?.textContent);
check('and the server has it open', (await server()).current === original.id);

section('เปลี่ยนตึก waits behind ✎');
check('not on the board normally', !switchButton());
check('and no longer in the rail', !$('.brand button'));
await click($('.head .iconbtn'));
check('✎ brings it', !!switchButton());
check('to the left of ✎', switchButton()?.nextElementSibling === $('.head .iconbtn'));
await click($('.head .iconbtn'));
check('and ✓ takes it away again', !switchButton());
await switchBuilding();
check('pressed, it shows the chooser', text('h1') === 'เลือกตึก', text('h1'));
check('and stays there, though there is only one building', !$('.rail'));
check('with nothing open on the server', (await server()).current === null);

section('adding one is a small card that unfolds');
check('folded, there is no name box', !!$('.baddcard') && !$('.badd input'));
await click($('.baddcard'));
check('pressed, it asks for a name', !!$('.badd input'));
await click(btn('ยกเลิก', $('.badd')));
check('ยกเลิก folds it again', !!$('.baddcard') && !$('.badd'));
await click($('.baddcard'));
await click(btn('เพิ่ม', $('.badd')), 200);
check('a blank name is refused on the screen', body().includes('กรุณาใส่ชื่อตึก'));
check('and nothing opened', text('h1') === 'เลือกตึก');
await type($('.badd input'), original.name);
await click(btn('เพิ่ม', $('.badd')), 300);
check('a name already used is refused, with the server\'s reason',
  $('.badd .err')?.textContent.includes('อยู่แล้ว'), $('.badd .err')?.textContent);
await type($('.badd input'), NAME);
await click(btn('เพิ่ม', $('.badd')), 500);
await settle(200);
check('a new name opens straight into the building', text('h1') === 'ห้องพัก', text('h1'));
check('its name is at the top of the rail', $('.brand span')?.textContent === NAME, $('.brand span')?.textContent);
check('and it has no rooms', $('.brand small')?.textContent.includes('0 ห้อง'));

section('two buildings: launch asks');
await launch();
check('the chooser, not a building', text('h1') === 'เลือกตึก', text('h1'));
check('both are cards', !!card(NAME) && !!card(original.name));
check('the new one uncoloured, with the default icon', card(NAME)?.classList.contains('plain'));

section('the server losing the open building sends the screen back');
await click(card(original.name), 500);
await settle(200);
check('pressing a card opens its building', text('h1') === 'ห้องพัก'
  && $('.brand span')?.textContent === original.name, $('.brand span')?.textContent);
check('with its rooms', !$('.brand small')?.textContent.startsWith('0 '), $('.brand small')?.textContent);
await fetch(`${API}/buildings/close`, { method: 'POST' });
// ตั้งค่า asks the server for its backups as it opens, so it meets the refusal.
await nav('ตั้งค่า');
await settle(300);
check('back on the chooser', text('h1') === 'เลือกตึก', text('h1'));
check('saying why', body().includes('กรุณาเลือกตึกอีกครั้ง'));

section('the pencil: colour and icon');
await click(tool(NAME, 'เปลี่ยนสีและไอคอน'));
check('it opens the choices on the card', !!card(NAME).querySelector('.bswatches'));
await click(card(NAME), 300);
check('pressing the card while choosing does not open it', text('h1') === 'เลือกตึก');
await click(card(NAME).querySelector('.bswatch[aria-label="ฟ้า"]'), 300);
check('a colour is saved', (await server()).buildings.find(b => b.name === NAME)?.color === 'blue');
check('and the border takes it', card(NAME).style.getPropertyValue('--accent') === '#4A90B8',
  card(NAME).style.getPropertyValue('--accent'));
check('and it is marked as chosen', card(NAME).querySelector('.bswatch.on')?.getAttribute('aria-label') === 'ฟ้า');
await click(card(NAME).querySelector('.bpick[aria-label="house"]'), 300);
check('an icon is saved', (await server()).buildings.find(b => b.name === NAME)?.icon === 'house');
check('the other building is untouched',
  (await server()).buildings.find(b => b.id === original.id)?.color === 'none');
await click(btn('เสร็จ', card(NAME)));
check('เสร็จ closes the choices', !card(NAME).querySelector('.bswatches'));

section('deleting needs the name typed in full');
await click(tool(NAME, 'ลบตึก'));
const confirm = () => btn('ลบตึกนี้', card(NAME));
check('the delete button is there and off', confirm() && confirm().disabled);
check('it says the file is kept', card(NAME).textContent.includes('buildings-deleted'));
await type(card(NAME).querySelector('.bpanel input'), NAME.slice(0, -1));
check('a name one letter short leaves it off', confirm().disabled);
await click(btn('ยกเลิก', card(NAME)));
check('ยกเลิก puts the card back', !confirm() && !card(NAME).querySelector('.bpanel'));
await click(tool(NAME, 'ลบตึก'));
await type(card(NAME).querySelector('.bpanel input'), NAME);
check('the exact name turns it on', !confirm().disabled);
await click(confirm(), 400);
check('and the building is gone', !card(NAME));
check('down to one, the chooser stays rather than jumping into it',
  text('h1') === 'เลือกตึก' && !!card(original.name), text('h1'));

await click(card(original.name), 500);
await settle(200);
check('the remaining building opens from its card', text('h1') === 'ห้องพัก');
check('with the notice gone', !body().includes('กรุณาเลือกตึกอีกครั้ง'));

section('one building again: the server losing it reopens it, nothing to choose');
await launch();
check('launch goes straight in once more', text('h1') === 'ห้องพัก', text('h1'));
await fetch(`${API}/buildings/close`, { method: 'POST' });
await nav('ตั้งค่า');
// Refused, back to the chooser, open, reload the building: several round
// trips, so wait for the rail rather than guess how long they take.
for(let i = 0; i < 60 && !$('.rail .nav'); i++) await settle(50);
check('lands back in the building by itself', !!$('.rail') && $('.brand span')?.textContent === original.name,
  text('h1'));

check('the runner\'s building is open again', (await server()).current === original.id);

done();
