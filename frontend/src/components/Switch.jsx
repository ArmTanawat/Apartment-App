/* The toggle used for แสดงห้องว่าง, คิดขั้นต่ำ, คิดรายวัน and the fee-type
   active column. Same markup as the prototype's .switch button. */
export default function Switch({ on, onClick, style, title, children }){
  return (
    <button className={"switch" + (on ? " on" : "")} onClick={onClick} style={style} title={title}>
      <span className="track"><i /></span>{children}
    </button>
  );
}
