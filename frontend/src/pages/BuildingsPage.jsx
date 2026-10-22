/* เลือกตึก — the first screen, every time the program opens.
 *
 * Each building is a separate set of data: its own rooms, tenants, bills and
 * settings, sharing nothing with the others. Choosing one here is what makes
 * every other screen read and write that building, which is why it is asked
 * at every launch rather than remembered — readings typed into the wrong
 * building look perfectly normal until the bills come out wrong.
 *
 * One card per building, side by side; pressing anywhere on a card opens it.
 * Its colour and icon are there so the right card is found without reading,
 * and are changed with the pencil. Adding a building is rare, so it is one
 * small card that unfolds into a name box only when pressed.
 *
 * It sits outside DataProvider: there is no building's data to load yet. When
 * the server says one is already open (a page reload, or the desktop shell
 * bringing a crashed server back), it goes straight through.
 */
import { useEffect, useState } from 'react';
import ErrBox from '../components/ErrBox.jsx';
import { del, get, messageOf, post, put } from '../lib/api.js';
import { useSubmit } from '../lib/useSubmit.js';

// The ids must match backend/building-look.js. An id missing here draws as the
// first entry, so a mismatch shows as plain rather than breaking.
const LOOK_COLORS = {
  none:   { label: 'ไม่มีสี', value: 'var(--line)' },
  ink:    { label: 'ดำ',     value: 'var(--ink)' },
  blue:   { label: 'ฟ้า',     value: '#4A90B8' },
  green:  { label: 'เขียว',   value: '#2E7D46' },
  amber:  { label: 'เหลือง',  value: '#C9A227' },
  orange: { label: 'ส้ม',     value: '#D2894A' },
  red:    { label: 'แดง',    value: '#B3382C' },
  purple: { label: 'ม่วง',    value: '#7B5EA7' },
};

const LOOK_ICONS = {
  building: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></>,
  house:    <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></>,
  towers:   <><rect x="3" y="8" width="8" height="13" /><rect x="13" y="3" width="8" height="18" /><path d="M6 12h2M6 16h2M16 7h2M16 11h2M16 15h2" /></>,
  shop:     <><path d="M3 9l2-5h14l2 5z" /><path d="M5 9v11h14V9" /><path d="M10 20v-6h4v6" /></>,
  tree:     <><path d="M12 3l6 9H6z" /><path d="M12 8l7 10H5z" /><path d="M12 18v3" /></>,
  star:     <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.8l6.1-.9z" />,
};

const colorOf = id => (LOOK_COLORS[id] || LOOK_COLORS.none).value;

function Icon({ children, size = 18 }){
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const PENCIL = <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>;
const TRASH  = <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />;
const PLUS   = <path d="M12 5v14M5 12h14" />;

export default function BuildingsPage({ notice, onOpen }){
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(null);

  const load = async () => {
    try {
      const r = await get('/buildings');
      if(r.current){
        const open = r.buildings.find(b => b.id === r.current);
        if(open){ onOpen(open); return; }
      }
      setList(r.buildings);
      setFailed(null);
    } catch (e) {
      setFailed(messageOf(e));
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const open = async id => onOpen(await post(`/buildings/${id}/open`));
  const replace = b => setList(l => l.map(x => x.id === b.id ? b : x));

  return (
    <div className="chooser">
      <main className="main">
        <div className="head"><h1>เลือกตึก</h1></div>
        <p className="sub">แต่ละตึกเก็บข้อมูลแยกกันทั้งหมด ห้อง ผู้เช่า บิล และการตั้งค่า</p>

        {notice && <div className="warn">{notice}</div>}

        {failed ? <>
          <div className="err">{failed}</div>
          <div className="actions"><button className="btn" onClick={load}>ลองใหม่</button></div>
        </> : list === null ? <p className="sub">กำลังโหลด…</p> : <>
          {list.length === 0 && <p className="sub">ยังไม่มีตึก กดเพิ่มตึกเพื่อเริ่ม</p>}
          <div className="bgrid">
            {list.map(b => <BuildingCard key={b.id} b={b} onOpen={open}
              onChanged={replace} onDeleted={load} />)}
            <AddCard onAdded={open} />
          </div>
        </>}
      </main>
    </div>
  );
}

function BuildingCard({ b, onOpen, onChanged, onDeleted }){
  // idle: the card opens the building. edit and delete take the card over,
  // and it stops opening anything until they are closed.
  const [mode, setMode] = useState('idle');
  const [typed, setTyped] = useState('');
  const { error, busy, run, setError } = useSubmit();

  // A file that cannot be read has no name to type; the server takes its id.
  const expected = b.unreadable ? b.id : b.name;
  const idle = mode === 'idle';
  const canOpen = idle && !busy && !b.unreadable;

  const openIt = () => { if(canOpen) run(() => onOpen(b.id)); };
  const setLook = change => run(async () => onChanged(await put(`/buildings/${b.id}/look`, change)));
  const remove = () => run(async () => {
    await del(`/buildings/${b.id}`, { name: typed.trim() });
    await onDeleted();
  });
  const close = () => { setMode('idle'); setTyped(''); setError(null); };
  const tool = (next, label, icon) => (
    <button className="btool" title={label} aria-label={label}
      onClick={e => { e.stopPropagation(); setError(null); setMode(mode === next ? 'idle' : next); }}>
      <Icon size={16}>{icon}</Icon>
    </button>
  );

  return (
    <div className={'bcard' + (canOpen ? ' opens' : '') + (LOOK_COLORS[b.color] && b.color !== 'none' ? '' : ' plain')}
      style={{'--accent': colorOf(b.color)}}
      role={canOpen ? 'button' : undefined} tabIndex={canOpen ? 0 : undefined}
      onClick={openIt} onKeyDown={e => { if(e.key === 'Enter' && e.target === e.currentTarget) openIt(); }}>
      <div className="btools">
        {tool('edit', 'เปลี่ยนสีและไอคอน', PENCIL)}
        {tool('delete', 'ลบตึก', TRASH)}
      </div>
      <div className="bicon"><Icon size={30}>{LOOK_ICONS[b.icon] || LOOK_ICONS.building}</Icon></div>
      <div className="bname" title={b.name}>{b.name}</div>
      {b.units !== null && <small><span className="num">{b.units}</span> ห้อง</small>}

      {mode === 'edit' && <div className="bpanel">
        <div className="blabel">สีขอบ</div>
        <div className="bswatches">
          {Object.entries(LOOK_COLORS).map(([id, c]) => (
            <button key={id} title={c.label} aria-label={c.label}
              className={'bswatch' + (id === b.color ? ' on' : '') + (id === 'none' ? ' none' : '')}
              style={{'--c': c.value}} disabled={busy} onClick={() => setLook({ color: id })} />
          ))}
        </div>
        <div className="blabel">ไอคอน</div>
        <div className="bicons">
          {Object.entries(LOOK_ICONS).map(([id, svg]) => (
            <button key={id} aria-label={id} className={'bpick' + (id === b.icon ? ' on' : '')}
              disabled={busy} onClick={() => setLook({ icon: id })}><Icon>{svg}</Icon></button>
          ))}
        </div>
        <div className="actions"><button className="btn ghost" onClick={close}>เสร็จ</button></div>
      </div>}

      {mode === 'delete' && <div className="bpanel">
        <p className="bwarn">ห้อง ผู้เช่า บิล และใบเสร็จทั้งหมดของตึกนี้จะหายไปจากโปรแกรม
          ไฟล์ยังเก็บไว้ในโฟลเดอร์ buildings-deleted</p>
        <div className="field">
          <label>พิมพ์ <b>{expected}</b> เพื่อยืนยัน</label>
          <input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoFocus />
        </div>
        <div className="actions">
          <button className="btn danger" disabled={busy || typed.trim() !== expected}
            onClick={remove}>ลบตึกนี้</button>
          <button className="btn ghost" onClick={close}>ยกเลิก</button>
        </div>
      </div>}

      <ErrBox>{error}</ErrBox>
    </div>
  );
}

// A new building starts empty, on the default rates; nothing is copied from
// another one.
function AddCard({ onAdded }){
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const { error, busy, run, setError } = useSubmit();

  const add = () => run(
    async () => {
      const made = await post('/buildings', { name: name.trim() });
      await onAdded(made.id);
    },
    () => !name.trim() ? 'กรุณาใส่ชื่อตึก' : null);
  const cancel = () => { setAdding(false); setName(''); setError(null); };

  if(!adding){
    return (
      <button className="baddcard" onClick={() => setAdding(true)}>
        <Icon>{PLUS}</Icon>เพิ่มตึก
      </button>
    );
  }

  return (
    <div className="bcard badd">
      <div className="field">
        <label>ชื่อตึกใหม่</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus
          onKeyDown={e => { if(e.key === 'Enter') add(); if(e.key === 'Escape') cancel(); }} />
      </div>
      <ErrBox>{error}</ErrBox>
      <div className="actions">
        <button className="btn" disabled={busy} onClick={add}>เพิ่ม</button>
        <button className="btn ghost" onClick={cancel}>ยกเลิก</button>
      </div>
    </div>
  );
}
