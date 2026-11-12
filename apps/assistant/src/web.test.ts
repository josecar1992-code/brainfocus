import { describe, it, expect } from "vitest";
import { assertPublicUrl, htmlToText } from "./web.js";

describe("web", () => {
  it("rechaza direcciones internas y esquemas raros", async () => {
    for (const u of ["http://127.0.0.1/x", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest", "http://[::1]/", "file:///etc/passwd", "ftp://example.com", "no es url"]) {
      await expect(assertPublicUrl(u)).rejects.toThrow();
    }
  });
  it("acepta una IP pública", async () => {
    expect((await assertPublicUrl("https://8.8.8.8/x")).hostname).toBe("8.8.8.8");
  });
  it("htmlToText quita scripts, etiquetas y entidades", () => {
    expect(htmlToText("<head><title>t</title></head><script>var a=1</script><p>Hola&nbsp;&amp; <b>mundo</b></p>")).toBe("Hola & mundo");
  });
});

import { findSimilarAvisos, similarTo } from "@brainfocus/focusbrain-tools";

describe("avisos duplicados", () => {
  const a = (id: string, title: string, time: string, extra = {}) => ({ id, title, time_of_day: time, active: true, schedule_type: "recurring", ...extra });
  const avisos = [
    a("1", "Devocional bíblico", "20:00"),
    a("2", "Devocional bíblico diario", "20:30"),
    a("3", "Quiero que me des un recordatorio cada día para hacer un devocional bíblico", "21:00"),
    a("4", "Quiero que me des 3 noticias internacionales", "08:13"),
    a("5", "Dame un capítulo nuevo cada día que sea consecutivo, del libro de Marcos de la biblia", "08:35"),
  ];
  it("agrupa los devocionales casi iguales y deja aparte noticias y Marcos", () => {
    const g = findSimilarAvisos(avisos);
    expect(g).toHaveLength(1);
    expect(g[0].map((x) => x.id)).toEqual(["1", "2", "3"]);
  });
  it("ignora pausados y distintos tipos; similarTo detecta uno nuevo parecido", () => {
    expect(findSimilarAvisos([a("1", "Tomar agua", "10:00"), a("2", "Tomar agua", "11:00", { active: false })])).toEqual([]);
    expect(similarTo("Devocional bíblico por la noche", "recurring", avisos).map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(similarTo("Devocional bíblico", "once", avisos)).toEqual([]);
  });
});
