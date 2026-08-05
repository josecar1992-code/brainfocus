import { useRef, useState } from "react";

// Selector de hora propio (reloj analógico, como el picker nativo de
// Android) en vez de <input type="time">: ese input delega en el picker del
// sistema operativo, y en algunos Android el botón "Establecer" quedaba fuera
// de la pantalla; en escritorio Chrome lo renderiza como un desplegable de
// texto en vez de un reloj. Al ser nuestro propio modal (mismo patrón fixed
// inset-0 que el resto de diálogos de la app) queda siempre centrado y
// completo en pantalla, en cualquier dispositivo.

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_TICKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const RADIUS = 72;

function angleFromCenter(cx: number, cy: number, x: number, y: number) {
  const dx = x - cx;
  const dy = y - cy;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function pointOnCircle(angleDeg: number, radius = RADIUS) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 100 + radius * Math.sin(rad), y: 100 - radius * Math.cos(rad) };
}

function to24Hour(h12: number, isPM: boolean) {
  const base = h12 % 12; // 12 -> 0
  return base + (isPM ? 12 : 0);
}

function formatDisplay(value: string) {
  if (!value) return "Elegir hora";
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "p. m." : "a. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function TimePicker({
  value,
  onChange,
  className,
}: {
  value: string; // "HH:MM" 24h, "" = sin elegir
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"hour" | "minute">("hour");
  const [hour24, setHour24] = useState(0);
  const [minute, setMinute] = useState(0);
  const [isPM, setIsPM] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  function openPicker() {
    const [h, m] = value ? value.split(":").map(Number) : [12, 0];
    setHour24(h);
    setMinute(m);
    setIsPM(h >= 12);
    setStage("hour");
    setOpen(true);
  }

  function handlePointer(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = angleFromCenter(cx, cy, e.clientX, e.clientY);
    if (stage === "hour") {
      const idx = Math.round(angle / 30) % 12;
      setHour24(to24Hour(HOURS[idx], isPM));
    } else {
      setMinute(Math.round(angle / 6) % 60);
    }
  }

  function confirm() {
    onChange(`${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    setOpen(false);
  }

  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const handAngle = stage === "hour" ? HOURS.indexOf(h12) * 30 : minute * 6;
  const hand = pointOnCircle(handAngle);

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={
          className ??
          "border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 text-left focus:outline-none focus:border-electric-cyan/70 transition text-white/90"
        }
      >
        {formatDisplay(value)}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-40"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-[280px] border border-electric-cyan/20 bg-night-blue rounded-2xl p-5 flex flex-col items-center gap-4 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStage("hour")}
                className={`text-3xl font-semibold tabular-nums ${stage === "hour" ? "text-electric-cyan" : "text-white/40"}`}
              >
                {String(h12).padStart(2, "0")}
              </button>
              <span className="text-3xl font-semibold text-white/40">:</span>
              <button
                type="button"
                onClick={() => setStage("minute")}
                className={`text-3xl font-semibold tabular-nums ${stage === "minute" ? "text-electric-cyan" : "text-white/40"}`}
              >
                {String(minute).padStart(2, "0")}
              </button>
              <div className="flex flex-col ml-2 text-xs font-semibold gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsPM(false);
                    setHour24(to24Hour(h12, false));
                  }}
                  className={!isPM ? "text-electric-cyan" : "text-white/30"}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPM(true);
                    setHour24(to24Hour(h12, true));
                  }}
                  className={isPM ? "text-electric-cyan" : "text-white/30"}
                >
                  PM
                </button>
              </div>
            </div>

            <svg
              ref={svgRef}
              viewBox="0 0 200 200"
              width={220}
              height={220}
              className="touch-none select-none"
              onPointerDown={(e) => {
                draggingRef.current = true;
                handlePointer(e);
              }}
              onPointerMove={(e) => draggingRef.current && handlePointer(e)}
              onPointerUp={() => (draggingRef.current = false)}
              onPointerLeave={() => (draggingRef.current = false)}
            >
              <circle cx="100" cy="100" r="90" className="fill-white/5" />
              <line x1="100" y1="100" x2={hand.x} y2={hand.y} stroke="currentColor" className="text-electric-cyan" strokeWidth="2" />
              <circle cx="100" cy="100" r="4" className="fill-electric-cyan" />

              {stage === "hour"
                ? HOURS.map((h, i) => {
                    const { x, y } = pointOnCircle(i * 30);
                    const active = h12 === h;
                    return (
                      <g key={h}>
                        {active && <circle cx={x} cy={y} r="13" className="fill-electric-cyan" />}
                        <text
                          x={x}
                          y={y + 5}
                          textAnchor="middle"
                          fontSize="16"
                          className={active ? "fill-night-blue font-bold" : "fill-white/70"}
                        >
                          {h}
                        </text>
                      </g>
                    );
                  })
                : MINUTE_TICKS.map((m) => {
                    const { x, y } = pointOnCircle(m * 6);
                    const active = minute === m;
                    return (
                      <g key={m}>
                        {active && <circle cx={x} cy={y} r="13" className="fill-electric-cyan" />}
                        <text
                          x={x}
                          y={y + 5}
                          textAnchor="middle"
                          fontSize="16"
                          className={active ? "fill-night-blue font-bold" : "fill-white/70"}
                        >
                          {String(m).padStart(2, "0")}
                        </text>
                      </g>
                    );
                  })}
            </svg>

            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg px-3 py-2 text-sm hover:brightness-110 transition"
              >
                Establecer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
