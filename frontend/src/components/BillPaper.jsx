import { baht } from '../lib/helpers.js';
import { bahtText } from '../lib/bahtText.js';
import { meterFields } from '../lib/meterFields.js';
import { useData } from '../state/DataContext.jsx';

/* The invoice, and the receipt.
 *
 * Shared by the single views and both print-all views, so what is checked on
 * screen is exactly what leaves the printer. A receipt is nearly the same
 * document as the invoice it is for — the same tenant, the same room, the same
 * lines, the same total — so it is the same component rather than a second
 * copy that would drift.
 *
 * The line items come from the bill, never recomputed: a bill is a record of
 * what was charged, and a receipt is a record of what was paid against it.
 * Only the building's own header is read from settings, because that describes
 * who issued the paper rather than what it cost.
 *
 * What a receipt does differently, and why each one matters:
 *
 *   the title and the document number   — it is not an invoice and must not read as one
 *   a signature line                    — the reason the thing exists on paper
 *   its own note                        — about this payment, not about every bill
 *   no bank details                     — the money has already arrived; telling
 *                                         someone how to pay it again is wrong
 */
export default function BillPaper({ bill: b, receipt = null }){
  const { settings } = useData();
  const isReceipt = !!receipt;
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
          <div style={{fontWeight:500}}>{isReceipt ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้"}</div>
          {/* Both papers name the month here. A receipt used to carry its own
              number in this slot; without one there is nothing that identifies
              it except the bill it settles, which is the month and the room.
              A receipt adds the day it was issued underneath — the date alone,
              because the minute a piece of paper was printed is not something
              anybody reads off it. */}
          <div className="small">{isReceipt ? "Receipt" : "Invoice"}<br />
            งวดที่ <span className="num">{b.period}</span>
            {isReceipt ? <><br />ออกเมื่อ{" "}
              <span className="num">{String(receipt.issued_at || "").slice(0, 10)}</span></> : null}</div>
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
          {b.items.map((i, n) => {
            // A utility line buries its three checkable figures inside a
            // sentence. They are lifted out and labelled; the sentence stays,
            // because it is what lets a tenant follow the arithmetic.
            const m = meterFields(i.detail);
            return (
              <tr key={n}>
                <td>
                  {i.label}
                  {m ? <>
                    <span className="meter">
                      <span><b>ก่อนหน้า</b>{m.prev}</span>
                      <span><b>ปัจจุบัน</b>{m.curr}</span>
                      <span><b>ใช้ไป</b>{m.used} หน่วย</span>
                      {m.rolled ? <span><b>มิเตอร์</b>ครบรอบ</span> : null}
                    </span>
                    <small>{m.working}</small>
                  </> : (i.detail ? <small>{i.detail}</small> : null)}
                </td>
                <td className="r">{baht(i.amount)}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td>รวมทั้งสิ้น Total<small className="words">({bahtText(b.total)})</small></td>
            <td className="r">{baht(b.total)}</td>
          </tr>
        </tbody>
      </table>

      {isReceipt ? <>
        {/* Only the note, and only when there is one. The date moved up to the
            header and the standing "ได้รับเงินตามรายการข้างต้นเรียบร้อยแล้ว"
            line is gone, so on a receipt with no note there is nothing left to
            put here and the empty rule above it would be all that showed. */}
        {receipt.note ? <div className="pfoot">{receipt.note}</div> : null}
        <div className="sign">
          <div><i /><span>ผู้รับเงิน</span></div>
        </div>
      </> : (
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
      )}
    </div>
  );
}
