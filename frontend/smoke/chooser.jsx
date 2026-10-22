/* เลือกตึก, from the screen.
 *
 * The program opens with no building open, so this closes whatever the runner
 * opened before the app is rendered — the harness renders on import, so it is
 * imported after. Ends with the runner's building open again.
 *
 *   npx vite build --ssr smoke/chooser.jsx --outDir smoke-dist
 *   node smoke-dist/chooser.js
 */
import { API } from './api-base.mjs';

const before = await (await fetch(`${API}/buildings`)).json();
const original = before.buildings.find(b => b.id === before.current);
await fetch(`${API}/buildings/close`, { method: 'POST' });

const { $, $$, body, check, click, done, nav, section, settle, text, type } =
  await import('./harness.jsx');

const NAME = `ตึกหน้าจอ ${Date.now().toString(36)}`;
const card = name => $$('.bcard').find(r => r.querySelector('.bname')?.textContent === name);
const btn = (label, ctx = document) => $$('.btn', ctx).find(b => b.textContent === label);
const tool = (name, label) => card(name)?.querySelector(`.btool[aria-label="${label}"]`);
const server = async () => (await fetch(`${API}/buildings`)).json();

section('the program opens on the chooser');
check('it asks which building', text('h1') === 'เลือกตึก', text('h1'));
check('no rail, nothing of any building shown', !$('.rail'));
check('the existing building is a card', !!card(original.name), body().slice(0, 300));
check('the cards sit in one grid', !!$('.bgrid') && $$('.bgrid > .bcard').length >= 1);

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

section('เปลี่ยนตึก');
await click($('.brand .switch'), 400);
check('goes back to the chooser', text('h1') === 'เลือกตึก', text('h1'));
check('and the server has nothing open', (await server()).current === null);
check('the new building is a card, uncoloured and with the default icon',
  card(NAME)?.classList.contains('plain'));

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
check('the other one is still there', !!card(original.name));

section('pressing a card opens its building');
await click(card(original.name), 500);
await settle(200);
check('lands in it', text('h1') === 'ห้องพัก' && $('.brand span')?.textContent === original.name,
  $('.brand span')?.textContent);
check('with its rooms', !$('.brand small')?.textContent.startsWith('0 '), $('.brand small')?.textContent);

section('the server losing the open building sends the screen back');
await fetch(`${API}/buildings/close`, { method: 'POST' });
// ตั้งค่า asks the server for its backups as it opens, so it meets the refusal.
await nav('ตั้งค่า');
await settle(300);
check('back on the chooser', text('h1') === 'เลือกตึก', text('h1'));
check('saying why', body().includes('กรุณาเลือกตึกอีกครั้ง'));
await click(card(original.name), 500);
await settle(200);
check('and the building opens again from there', text('h1') === 'ห้องพัก');
check('with the notice gone', !body().includes('กรุณาเลือกตึกอีกครั้ง'));

check('the runner\'s building is open again', (await server()).current === original.id);

done();
