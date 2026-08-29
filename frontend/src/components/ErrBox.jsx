/* The prototype's `err(m)` helper, which wrote into #formErr. Here the message
   is state on the form and this renders it — JSX escapes, so a name with an
   ampersand in it no longer breaks the box. */
export default function ErrBox({ children }){
  if(!children) return null;
  return <div className="err">{children}</div>;
}
