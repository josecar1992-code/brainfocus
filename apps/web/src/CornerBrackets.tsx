// Detalle "HUD" reutilizado en cards/modales importantes para reforzar la
// estética futurista del login en el resto de la app.
export function CornerBrackets() {
  const base = "absolute w-4 h-4 border-electric-cyan/50 pointer-events-none";
  return (
    <>
      <div className={`${base} top-0 left-0 border-t-2 border-l-2 rounded-tl`} />
      <div className={`${base} top-0 right-0 border-t-2 border-r-2 rounded-tr`} />
      <div className={`${base} bottom-0 left-0 border-b-2 border-l-2 rounded-bl`} />
      <div className={`${base} bottom-0 right-0 border-b-2 border-r-2 rounded-br`} />
    </>
  );
}
