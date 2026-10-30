import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../env.js", () => ({
  env: {
    openclawGatewayUrl: "http://gw",
    openclawGatewayToken: "t",
    openclawReminderTo: "+506",
    openclawReminderToTelegram: "",
    openclawOwnerUserId: "owner",
  },
}));

import { cancelReminderCron, scheduleReminderCron, scheduleRecurringCron, scheduleOnceCron } from "./openclawCron.js";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, payload: { id: "job1" } }) });
  vi.stubGlobal("fetch", fetchMock);
});

const reminder = (user_id?: string) => ({ id: "r1", user_id, title: "t", remind_at: "2030-01-01T10:00:00-06:00", channel: "whatsapp" });

describe("cron de OpenClaw solo para el dueño", () => {
  it("no programa nada para otro usuario ni cuando no se sabe quién es", async () => {
    expect(await scheduleReminderCron(reminder("other"))).toBeNull();
    expect(await scheduleReminderCron(reminder(undefined))).toBeNull();
    expect(await scheduleRecurringCron({ userId: "other", displayName: "d", cronExpr: "0 9 * * *", message: "m", channel: null })).toBeNull();
    expect(await scheduleOnceCron({ userId: "other", displayName: "d", at: "2030-01-01T10:00:00-06:00", message: "m", channel: null })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("programa para el dueño", async () => {
    expect(await scheduleReminderCron(reminder("owner"))).toBe("job1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("cancelar un job existente siempre llega a OpenClaw (regresión: el aviso viejo seguía sonando)", async () => {
    await cancelReminderCron("job-viejo");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ method: "cron.remove", params: { jobId: "job-viejo" } });
  });

  it("sin job no llama a nada", async () => {
    await cancelReminderCron(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
