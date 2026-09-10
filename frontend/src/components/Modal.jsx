import { useUi } from '../state/UiContext.jsx';

/* The veil and the white card. Clicking the veil itself closes, exactly as
   the prototype's `t.closest("[data-veil]") === t` test did — a click that
   started inside the card does not. */
export default function Modal({ children, wide = false }){
  const { closeModal } = useUi();
  return (
    <div className="veil" onMouseDown={e => { if(e.target === e.currentTarget) closeModal(); }}>
      {/* `wide` is for the one dialog holding a chart rather than a form. A
          chart squeezed into form width is unreadable, and widening every
          dialog to suit it would make the forms worse. */}
      <div className={"modal" + (wide ? " wide" : "")}>{children}</div>
    </div>
  );
}
