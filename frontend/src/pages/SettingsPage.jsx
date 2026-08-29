import { useEffect, useRef, useState } from 'react';
import ErrBox from '../components/ErrBox.jsx';
import Switch from '../components/Switch.jsx';
import { get, messageOf } from '../lib/api.js';
import { baht } from '../lib/helpers.js';
import { useApi } from '../lib/useApi.js';
import { useData } from '../state/DataContext.jsx';
import { useUi } from '../state/UiContext.jsx';

/* ตั้งค่า — building details with a live preview of the invoice header, bank
   details with a preview of the footer, the two utility rates shown as a
   worked example, meter digit counts, fee types, and backups. */
export default function SettingsPage(){
  const { settings, feeTypes, leases, patchSettings, updateFeeType, makeBackup } = useData();
  const { openModal, exampleUnits, setExampleUnits } = useUi();

  // Every box holds its own text. A figure being retyped passes through states
  // like "" and "1." that must not be rewritten under the caret, and the
  // previews below read the text so they move as you type — which is what the
  // prototype did by patching the DOM.
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState(null);
  const timers = useRef({});

  const shown = key => drafts[key] ?? String(settings[key] ?? "");
  const text = key => (drafts[key] ?? settings[key] ?? "");

  // The write follows shortly behind the typing rather than going out per
  // character. A failure is said once, at the top of the page.
  const schedule = (key, value) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      try { await patchSettings({ [key]: value }); setError(null); }
      catch (e) { setError(messageOf(e)); }
    }, 400);
  };
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const setNumber = (key, s) => {
    setDrafts(d => ({ ...d, [key]: s }));
    const v = parseFloat(s);
    if(!isNaN(v) && v >= 0) schedule(key, v);
  };
  const setText = (key, s) => {
    setDrafts(d => ({ ...d, [key]: s }));
    // An empty name is tolerated while typing and simply not written; the
    // server refuses it, and flashing that refusal at someone mid-retype
    // would say nothing useful.
    if(key === 'building_name' && s.trim() === "") return;
    schedule(key, s);
  };

  // Which fee types are attached to somebody. There is no endpoint for all
  // lease fees, so this asks per lease — the least-visited page, and the
  // answer decides only whether a delete button is offered.
  const leaseIds = leases.map(l => l.id);
  const usage = useApi(
    () => Promise.all(leaseIds.map(id => get(`/fees/lease/${id}`)))
      .then(all => new Set(all.flat().map(f => f.fee_type_id))),
    [leaseIds.join(","), feeTypes.length]);
  const inUse = id => !usage.data || usage.data.has(id);

  const backups = useApi(() => get('/backups'), []);
  const [backupError, setBackupError] = useState(null);
  const doBackup = async () => {
    setBackupError(null);
    try { await makeBackup(); backups.refresh(); }
    catch (e) { setBackupError(messageOf(e)); }
  };

  const bank = [text('bank_name').trim(), text('bank_account_number').trim()]
    .filter(Boolean).join("  ");
  const acc = text('bank_account_name').trim();

  return <>
    <div className="head"><h1>ตั้งค่า</h1></div>
    <p className="sub">เปลี่ยนไม่บ่อย ค่าเช่าต่อห้องตั้งที่หน้าห้องพัก ไม่ได้อยู่ที่นี่</p>

    <div className="setwrap">
      <ErrBox>{error}</ErrBox>
      <div className="warn" style={{marginBottom:"16px"}}>
        แก้เรทที่นี่มีผลกับบิลที่ออกหลังจากนี้เท่านั้น
        บิลที่ออกไปแล้วเก็บตัวเลขของตัวเองไว้ และจะไม่เปลี่ยนตาม</div>

      <div className="setcard">
        <h2>อพาร์ตเมนต์</h2>
        <p className="lead">ข้อมูลนี้พิมพ์เป็นหัวใบแจ้งหนี้ ผู้เช่าจะได้รู้ว่าใครออกบิล
          และติดต่อที่ไหนได้ ชื่อยังแสดงที่มุมบนซ้ายของโปรแกรมด้วย</p>
        <div className="rateline">
          <label>ชื่อ</label>
          <input value={shown('building_name')} onChange={e => setText('building_name', e.target.value)}
            style={{width:"280px",textAlign:"left",fontFamily:"inherit"}} />
        </div>
        <div className="rateline" style={{alignItems:"flex-start"}}>
          <label style={{paddingTop:"8px"}}>ที่อยู่</label>
          <textarea rows={2} value={shown('building_address')}
            onChange={e => setText('building_address', e.target.value)}
            style={{width:"280px",padding:"7px 10px",border:"1px solid var(--line)",borderRadius:"7px",
                    fontFamily:"inherit",fontSize:"14px",resize:"vertical",background:"var(--surface)",
                    color:"var(--ink)",lineHeight:1.6}} />
        </div>
        <div className="rateline">
          <label>เบอร์ติดต่อ</label>
          <input className="num" value={shown('building_phone')}
            onChange={e => setText('building_phone', e.target.value)}
            style={{width:"160px",textAlign:"left"}} />
        </div>

        <div className="example" style={{display:"block",lineHeight:1.7}}>
          <div style={{fontSize:"12px",color:"var(--muted)",marginBottom:"6px"}}>ตัวอย่างหัวใบแจ้งหนี้</div>
          <div style={{fontWeight:700}}>{text('building_name').trim() || "—"}</div>
          <div style={{fontSize:"13px"}}>{text('building_address').trim() || "—"}</div>
          <div style={{fontSize:"13px"}}>โทร {text('building_phone').trim() || "—"}</div>
        </div>
      </div>

      <div className="setcard">
        <h2>การชำระเงิน</h2>
        <p className="lead">พิมพ์ท้ายใบแจ้งหนี้ ผู้เช่าจะได้รู้ว่าโอนไปไหน
          เว้นว่างได้ถ้ารับเงินสดอย่างเดียว โปรแกรมไม่ได้บันทึกว่าใครจ่ายแล้ว
          ตรงนี้เป็นแค่ข้อความบนกระดาษ</p>
        <div className="rateline">
          <label>ธนาคาร</label>
          <input value={shown('bank_name')} onChange={e => setText('bank_name', e.target.value)}
            style={{width:"220px",textAlign:"left",fontFamily:"inherit"}} /></div>
        <div className="rateline">
          <label>เลขที่บัญชี</label>
          <input className="num" value={shown('bank_account_number')}
            onChange={e => setText('bank_account_number', e.target.value)}
            style={{width:"180px",textAlign:"left"}} /></div>
        <div className="rateline">
          <label>ชื่อบัญชี</label>
          <input value={shown('bank_account_name')}
            onChange={e => setText('bank_account_name', e.target.value)}
            style={{width:"220px",textAlign:"left",fontFamily:"inherit"}} /></div>

        <div className="rateline" style={{alignItems:"flex-start",marginTop:"16px"}}>
          <label style={{paddingTop:"8px"}}>หมายเหตุ</label>
          <textarea rows={2} placeholder="เขียนอะไรก็ได้ที่อยากให้ขึ้นบนบิลทุกใบ"
            value={shown('bill_note')} onChange={e => setText('bill_note', e.target.value)}
            style={{width:"280px",padding:"7px 10px",border:"1px solid var(--line)",borderRadius:"7px",
                    fontFamily:"inherit",fontSize:"14px",resize:"vertical",background:"var(--surface)",
                    color:"var(--ink)",lineHeight:1.6}} />
        </div>
        <p className="lead" style={{margin:"4px 0 0 130px"}}>เช่น กำหนดชำระ วันหยุด
          หรือเบอร์ไลน์สำหรับส่งสลิป</p>

        <div className="example" style={{display:"block",lineHeight:1.7}}>
          <div style={{fontSize:"12px",color:"var(--muted)",marginBottom:"6px"}}>ตัวอย่างท้ายใบแจ้งหนี้</div>
          <div style={{fontWeight:500}}>ชำระเงิน</div>
          <div style={{fontSize:"13px"}}>เงินสดที่สำนักงาน หรือโอนเข้าบัญชี</div>
          {/* Only the parts that were filled in appear, so a blank field prints
              as nothing rather than as a dash on a real invoice. */}
          <div style={{fontSize:"13px"}}>{[bank, acc ? `ชื่อบัญชี ${acc}` : ""].filter(Boolean).join(" · ") || "—"}</div>
          <div style={{fontSize:"13px",marginTop:"6px"}}>{text('bill_note').trim() || "—"}</div>
        </div>
      </div>

      <RateBlock kind="water" label="ค่าน้ำ" shown={shown} setNumber={setNumber}
        settings={settings} units={exampleUnits.water} drafts={drafts} setDrafts={setDrafts}
        setUnits={v => setExampleUnits(x => ({ ...x, water: v }))} />
      <RateBlock kind="electricity" label="ค่าไฟ" shown={shown} setNumber={setNumber}
        settings={settings} units={exampleUnits.electricity} drafts={drafts} setDrafts={setDrafts}
        setUnits={v => setExampleUnits(x => ({ ...x, electricity: v }))} />

      <div className="setcard">
        <h2>ประเภทค่าธรรมเนียม <button className="linkbtn" style={{float:"right",fontSize:"13px"}}
          onClick={() => openModal({kind:"feeType", id:null})}>+ เพิ่ม</button></h2>
        <p className="lead">รายการที่เลือกได้ตอนผูกค่าธรรมเนียมประจำกับผู้เช่า
          พิมพ์ไทยตามด้วยอังกฤษ เพราะชื่อนี้จะขึ้นบนใบแจ้งหนี้ตามที่พิมพ์</p>
        <table className="ftable">
          <thead><tr><th>ชื่อรายการ</th><th className="r">ค่าตั้งต้น</th><th className="r">ใช้งาน</th><th></th></tr></thead>
          <tbody>
            {feeTypes.map(f => (
              <tr key={f.id} className={f.is_active ? "" : "retired"}>
                <td><span className="fname">{f.name}</span></td>
                <td className="r num">{baht(f.default_amount)}</td>
                <td className="r">
                  <Switch on={!!f.is_active} style={{padding:"2px"}}
                    onClick={async () => {
                      try { await updateFeeType(f.id, {is_active: f.is_active ? 0 : 1}); setError(null); }
                      catch(e){ setError(messageOf(e)); }
                    }} />
                </td>
                <td className="r">
                  <button className="linkbtn" onClick={() => openModal({kind:"feeType", id:f.id})}>แก้</button>
                  {!inUse(f.id) && (
                    <button className="linkbtn danger" style={{marginLeft:"8px"}}
                      onClick={() => openModal({kind:"deleteFeeType", id:f.id})}>ลบ</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="lead" style={{margin:"14px 0 0"}}>รายการที่มีผู้เช่าใช้อยู่ลบไม่ได้
          ปิดใช้งานแทนเพื่อไม่ให้เลือกได้อีก บิลเก่ายังอ่านได้เหมือนเดิม</p>
      </div>

      <Backups req={backups} error={backupError} onBackup={doBackup} />
    </div>
  </>;
}

function RateBlock({ kind, label, shown, setNumber, settings, units, setUnits, drafts, setDrafts }){
  const digits = settings[kind + "_meter_digits"];

  // The worked example is priced by the same function that prices the line on
  // a bill — GET /bills/example. Working it out here would be a second copy of
  // the minimum-charge rule, which is what this page exists to explain.
  const example = useApi(() => get(`/bills/example/${kind}/${units}`),
    [kind, units, settings[kind+"_rate"], settings[kind+"_min_units"], settings[kind+"_min_amount"]]);

  return (
    <div className="setcard">
      <h2>{label}</h2>
      <p className="lead">หน่วยแรก ๆ คิดเหมา ส่วนที่เกินคิดตามจริง</p>

      <div className="rateline">
        <label>หน่วยแรก</label>
        <input className="num" value={shown(kind+"_min_units")}
          onChange={e => setNumber(kind+"_min_units", e.target.value)} />
        <span>หน่วย คิดเหมา</span>
        <input className="num" value={shown(kind+"_min_amount")}
          onChange={e => setNumber(kind+"_min_amount", e.target.value)} />
        <span>บาท</span>
      </div>
      <div className="rateline">
        <label>หน่วยถัดไป</label>
        <input className="num" value={shown(kind+"_rate")}
          onChange={e => setNumber(kind+"_rate", e.target.value)} />
        <span>บาท ต่อหน่วย</span>
      </div>
      <div className="rateline">
        <label>มิเตอร์</label>
        <input className="num" value={shown(kind+"_meter_digits")}
          onChange={e => setNumber(kind+"_meter_digits", e.target.value)} />
        <span>หลัก — ครบรอบที่ <span className="num">{Math.pow(10,digits).toLocaleString()}</span></span>
      </div>

      <div className="example">
        <span>ลองคำนวณ ใช้</span>
        <input className="num" value={drafts["eg_"+kind] ?? String(units)}
          onChange={e => {
            setDrafts(d => ({ ...d, ["eg_"+kind]: e.target.value }));
            const v = parseFloat(e.target.value);
            setUnits(isNaN(v) ? 0 : v);
          }} />
        <span>หน่วย จะเป็น</span>
        <b>{example.data ? baht(example.data.amount) : "—"}</b>
        <span>บาท</span>
      </div>
    </div>
  );
}

function Backups({ req, error, onBackup }){
  const list = (req.data && req.data.backups) || [];
  const keeps = (req.data && req.data.keeps) || 30;
  // listBackups() returns an ISO timestamp; the screen shows it the way a bill
  // shows its own.
  const when = iso => iso.replace("T", " ").slice(0, 16);

  return (
    <div className="setcard">
      <h2>สำรองข้อมูล</h2>
      <p className="lead">สำเนาถูกสร้างทุกครั้งที่เปิดโปรแกรม เก็บไว้ {keeps} ไฟล์ล่าสุด</p>
      <ErrBox>{error}</ErrBox>
      {list.length ? <>
        <div className="rateline" style={{marginBottom:"14px"}}>
          <label>ล่าสุด</label>
          <span style={{color:"var(--ink)",fontSize:"14px"}} className="num">{when(list[0].created_at)}</span>
          <span>· มีทั้งหมด <span className="num">{list.length}</span> ไฟล์</span>
        </div>
        <div className="bklist">{list.slice(0,5).map(b => (
          <div className="bkrow" key={b.filename}><b>{when(b.created_at)}</b>
            <span className="num">{b.size_kb} KB</span></div>
        ))}</div>
      </> : <p className="none">ยังไม่มีสำเนา</p>}
      <div className="actions">
        <button className="btn quiet" onClick={onBackup}>สำรองข้อมูลเดี๋ยวนี้</button>
      </div>
      <div className="warn" style={{marginTop:"14px"}}>สำเนาอยู่ในเครื่องเดียวกับตัวจริง
        ถ้าฮาร์ดดิสก์เสียจะหายทั้งคู่ ควรคัดลอกโฟลเดอร์ backups ไปเก็บที่อื่นเป็นครั้งคราว</div>
    </div>
  );
}
