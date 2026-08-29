import { baht } from '../lib/helpers.js';
import { useData } from '../state/DataContext.jsx';

/* The invoice itself. Shared by the single-bill view and the print-all view,
   so what is checked on screen is exactly what leaves the printer.

   The line items come from the bill, never recomputed — a bill is a record of
   what was charged. Only the building's own header and footer are read from
   settings, because those describe who issued it rather than what it cost. */
export default function BillPaper({ bill: b }){
  const { settings } = useData();
  const bank = [settings.bank_name, settings.bank_account_number].filter(Boolean).join("  ");

  return (
    <div className="paper">
      <div className="phead">
        <div>
          <h2>{settings.building_name}</h2>
          <div className="small">{settings.building_address || ""}
            {settings.building_phone ? <><br />โทร {settings.building_phone}</> : null}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:500}}>ใบแจ้งหนี้</div>
          <div className="small">Invoice<br /><span className="num">{b.period}</span></div>
        </div>
      </div>

      <dl className="pto">
        <dt>ผู้เช่า</dt><dd>{b.tenant_name}</dd>
        <dt>ห้อง</dt><dd className="num">{b.unit_number}</dd>
        {b.tenant_phone ? <><dt>โทร</dt><dd className="num">{b.tenant_phone}</dd></> : null}
        {b.tenant_address ? <><dt>ที่อยู่</dt><dd>{b.tenant_address}</dd></> : null}
      </dl>

      <table className="pitems">
        <thead><tr><th>รายการ</th><th className="r">จำนวนเงิน</th></tr></thead>
        <tbody>
          {b.items.map((i, n) => (
            <tr key={n}>
              <td>{i.label}{i.detail ? <small>{i.detail}</small> : null}</td>
              <td className="r">{baht(i.amount)}</td>
            </tr>
          ))}
          <tr className="total"><td>รวมทั้งสิ้น Total</td><td className="r">{baht(b.total)}</td></tr>
        </tbody>
      </table>

      <div className="pfoot">
        {(settings.bank_name || settings.bank_account_number) ? <>
          <b>ชำระเงิน</b><br />
          เงินสดที่สำนักงาน หรือโอนเข้าบัญชี<br />
          {bank}
          {settings.bank_account_name ? <><br />ชื่อบัญชี {settings.bank_account_name}</> : null}
        </> : <><b>ชำระเงิน</b><br />เงินสดที่สำนักงาน</>}
        {settings.bill_note ? <div style={{marginTop:"10px"}}>{settings.bill_note}</div> : null}
        <div style={{marginTop:"12px",fontSize:"12px"}}>ออกบิลเมื่อ <span className="num">{b.created_at}</span></div>
      </div>
    </div>
  );
}
