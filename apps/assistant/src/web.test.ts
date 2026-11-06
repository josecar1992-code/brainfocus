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
