import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const LINK_DISTANCE = 130;
const NODE_COLOR = "rgba(0, 210, 255, 0.55)";
const LINK_COLOR = "0, 210, 255";
const MOBILE_BREAKPOINT = 768;
// En móvil no se apaga más (pedido 15-ago-2026), pero corre bastante más
// liviano que en escritorio: menos nodos (el costo de las conexiones es
// O(n²), así que esto es lo que más importa), menos opacidad (más sutil,
// menos protagonismo detrás del contenido en una pantalla chica) y throttle
// de framerate (~20fps en vez de sin límite) para no repintar un canvas de
// pantalla completa 60 veces por segundo en un dispositivo sensible a
// batería/CPU.
const MOBILE_NODE_COUNT = 22;
const MOBILE_OPACITY_FACTOR = 0.55;
const MOBILE_FRAME_INTERVAL_MS = 1000 / 20;

interface NeuronBackgroundProps {
  /** Cantidad de nodos en escritorio — menos nodos = fondo más discreto detrás de pantallas con datos. */
  nodeCount?: number;
  /** Opacidad del canvas completo en escritorio (className `opacity-*` no acepta valores dinámicos). */
  opacity?: number;
}

// Fondo animado tipo "red neuronal" — nodos que derivan y se conectan por
// cercanía, inspirado en portales futuristas de dashboards de IA.
export function NeuronBackground({ nodeCount = 70, opacity = 0.7 }: NeuronBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let rafId = 0;
    let lastFrameTime = 0;
    let isMobile = false;
    // `prefers-reduced-motion` sigue apagando la animación por completo (es
    // una preferencia de accesibilidad, no de rendimiento) — lo demás en
    // móvil ahora es "más liviano", no "apagado".
    let animating = true;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width;
      canvas!.height = height;
      const wasAnimating = animating;
      const wasMobile = isMobile;
      isMobile = width < MOBILE_BREAKPOINT;
      canvas!.style.opacity = String(isMobile ? opacity * MOBILE_OPACITY_FACTOR : opacity);
      animating = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!animating) ctx!.clearRect(0, 0, width, height);
      // El breakpoint móvil/escritorio cambia la cantidad de nodos —
      // reinicializar para no arrastrar de más o de menos al cruzar el
      // breakpoint (ej. rotar el celular o achicar la ventana).
      if (isMobile !== wasMobile) initNodes();
      // Se apagó el loop de rAF al desactivar (ver step()) — si vuelve a
      // activarse (ej. cambia la preferencia de reduced-motion), hay que
      // relanzarlo a mano.
      if (animating && !wasAnimating) step(performance.now());
    }

    function initNodes() {
      const count = isMobile ? Math.min(nodeCount, MOBILE_NODE_COUNT) : nodeCount;
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
      }));
    }

    function step(now: number) {
      // Defensivo: si el layout aún no estaba listo cuando corrió resize()
      // (carrera en el primer paint), el canvas quedaría en 0x0 para siempre
      // ya que solo re-medimos en el evento "resize" de la ventana.
      if (width === 0 || height === 0) {
        resize();
        initNodes();
      }

      if (!animating) return; // el loop se relanza desde resize() si vuelve a activarse

      // Throttle solo en móvil — en escritorio sigue sin límite (rAF ~60fps).
      if (isMobile && now - lastFrameTime < MOBILE_FRAME_INTERVAL_MS) {
        rafId = requestAnimationFrame(step);
        return;
      }
      lastFrameTime = now;

      ctx!.clearRect(0, 0, width, height);

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DISTANCE) {
            ctx!.strokeStyle = `rgba(${LINK_COLOR}, ${0.18 * (1 - dist / LINK_DISTANCE)})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      ctx!.fillStyle = NODE_COLOR;
      for (const node of nodes) {
        ctx!.beginPath();
        ctx!.arc(node.x, node.y, 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }

      rafId = requestAnimationFrame(step);
    }

    resize();
    initNodes();
    step(performance.now());

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, [nodeCount]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ opacity }}
      aria-hidden="true"
    />
  );
}
