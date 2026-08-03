import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const NODE_COUNT = 70;
const LINK_DISTANCE = 130;
const NODE_COLOR = "rgba(0, 210, 255, 0.55)";
const LINK_COLOR = "0, 210, 255";

// Fondo animado tipo "red neuronal" — nodos que derivan y se conectan por
// cercanía, inspirado en portales futuristas de dashboards de IA.
export function NeuronBackground() {
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

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width;
      canvas!.height = height;
    }

    function initNodes() {
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
      }));
    }

    function step() {
      // Defensivo: si el layout aún no estaba listo cuando corrió resize()
      // (carrera en el primer paint), el canvas quedaría en 0x0 para siempre
      // ya que solo re-medimos en el evento "resize" de la ventana.
      if (width === 0 || height === 0) {
        resize();
        initNodes();
      }

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
    step();

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 opacity-70"
      aria-hidden="true"
    />
  );
}
