import { useUi } from '../state/UiContext.jsx';

/* The veil and the white card. Clicking the veil itself closes, exactly as
   the prototype's `t.closest("[data-veil]") === t` test did — a click that
   started inside the card does not. */
export default function Modal({ children, wide = false, className = "", sticky = false }){
  const { closeModal } = useUi();
  // `sticky` is for a dialog showing work in progress: a click beside it must
  // not take away the only place that says how far it has got.
  return (
    <div className="veil" onMouseDown={e => { if(!sticky && e.target === e.currentTarget) closeModal(); }}>
      {/* `wide` is for the one dialog holding a chart rather than a form. A
          chart squeezed into form width is unreadable, and widening every
          dialog to suit it would make the forms worse. className is for the
          import preview, a table of every room. */}
      <div className={"modal" + (wide ? " wide" : "") + (className ? " " + className : "")}>{children}</div>
    </div>
  );
}
