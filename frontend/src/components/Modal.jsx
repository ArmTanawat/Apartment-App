import { useUi } from '../state/UiContext.jsx';

/* The veil and the white card. Clicking the veil itself closes, exactly as
   the prototype's `t.closest("[data-veil]") === t` test did — a click that
   started inside the card does not. */
export default function Modal({ children }){
  const { closeModal } = useUi();
  return (
    <div className="veil" onMouseDown={e => { if(e.target === e.currentTarget) closeModal(); }}>
      <div className="modal">{children}</div>
    </div>
  );
}
