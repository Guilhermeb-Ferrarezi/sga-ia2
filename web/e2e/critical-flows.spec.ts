import { expect, test, type APIRequestContext } from "@playwright/test";

type LoginResponse = {
  token: string;
};

type Stage = {
  id: number;
  name: string;
};

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "";
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:5000";

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

test.describe("Critical CRM flows (API e2e)", () => {
  test.skip(!adminEmail || !adminPassword, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");

  test("move lead between stages", async ({ request }) => {
    const token = await login(request);
    const sourceStage = await ensureStage(request, token, `E2E Source ${uniqueSuffix()}`);
    const targetStage = await ensureStage(request, token, `E2E Target ${uniqueSuffix()}`);

    const waId = `55${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await createContact(request, token, waId, sourceStage.id);

    const moveRes = await request.put(`${apiBaseUrl}/api/contacts/${encodeURIComponent(waId)}/stage`, {
      headers: authHeader(token),
      data: { stageId: targetStage.id },
    });
    expect(moveRes.ok()).toBeTruthy();
    const moved = (await moveRes.json()) as { stageId: number | null };
    expect(moved.stageId).toBe(targetStage.id);
  });

  test("edit lead details", async ({ request }) => {
    const token = await login(request);
    const stage = await ensureStage(request, token, `E2E Edit ${uniqueSuffix()}`);

    const waId = `55${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await createContact(request, token, waId, stage.id);

    const editRes = await request.put(`${apiBaseUrl}/api/contacts/${encodeURIComponent(waId)}`, {
      headers: authHeader(token),
      data: {
        name: "Lead Editado E2E",
        city: "Sao Paulo",
        notes: "Atualizado por teste e2e",
      },
    });
    expect(editRes.ok()).toBeTruthy();
    const edited = (await editRes.json()) as { name: string | null; city: string | null; notes: string | null };
    expect(edited.name).toBe("Lead Editado E2E");
    expect(edited.city).toBe("Sao Paulo");
    expect(edited.notes).toBe("Atualizado por teste e2e");
  });

  test("delete lead", async ({ request }) => {
    const token = await login(request);
    const stage = await ensureStage(request, token, `E2E Delete ${uniqueSuffix()}`);

    const waId = `55${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await createContact(request, token, waId, stage.id);

    const deleteRes = await request.delete(`${apiBaseUrl}/api/contacts/${encodeURIComponent(waId)}`, {
      headers: authHeader(token),
    });
    expect(deleteRes.ok()).toBeTruthy();

    const boardRes = await request.get(`${apiBaseUrl}/api/pipeline/board`, {
      headers: authHeader(token),
    });
    expect(boardRes.ok()).toBeTruthy();
    const board = (await boardRes.json()) as {
      unassigned: Array<{ waId: string }>;
      stages: Array<{ contacts: Array<{ waId: string }> }>;
    };
    const exists =
      board.unassigned.some((c) => c.waId === waId) ||
      board.stages.some((s) => s.contacts.some((c) => c.waId === waId));
    expect(exists).toBeFalsy();
  });

  test("handoff flow", async ({ request }) => {
    const token = await login(request);
    const stage = await ensureStage(request, token, `E2E Handoff ${uniqueSuffix()}`);

    const waId = `55${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await createContact(request, token, waId, stage.id);

    const handoffOnRes = await request.put(`${apiBaseUrl}/api/contacts/${encodeURIComponent(waId)}`, {
      headers: authHeader(token),
      data: {
        handoffRequested: true,
        handoffReason: "Teste e2e",
        botEnabled: false,
      },
    });
    expect(handoffOnRes.ok()).toBeTruthy();
    const handoffOn = (await handoffOnRes.json()) as {
      handoffRequested: boolean;
      botEnabled: boolean;
      handoffReason: string | null;
    };
    expect(handoffOn.handoffRequested).toBeTruthy();
    expect(handoffOn.botEnabled).toBeFalsy();
    expect(handoffOn.handoffReason).toBe("Teste e2e");

    const handoffOffRes = await request.put(`${apiBaseUrl}/api/contacts/${encodeURIComponent(waId)}`, {
      headers: authHeader(token),
      data: {
        handoffRequested: false,
        botEnabled: true,
      },
    });
    expect(handoffOffRes.ok()).toBeTruthy();
    const handoffOff = (await handoffOffRes.json()) as {
      handoffRequested: boolean;
      botEnabled: boolean;
    };
    expect(handoffOff.handoffRequested).toBeFalsy();
    expect(handoffOff.botEnabled).toBeTruthy();
  });
});

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${apiBaseUrl}/api/auth/login`, {
    data: {
      email: adminEmail,
      password: adminPassword,
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as LoginResponse;
  return body.token;
}

async function ensureStage(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<Stage> {
  const createRes = await request.post(`${apiBaseUrl}/api/pipeline/stages`, {
    headers: authHeader(token),
    data: {
      name,
      color: "#06b6d4",
      isActive: true,
    },
  });
  expect(createRes.ok()).toBeTruthy();
  return (await createRes.json()) as Stage;
}

async function createContact(
  request: APIRequestContext,
  token: string,
  waId: string,
  stageId: number,
): Promise<void> {
  const createRes = await request.post(`${apiBaseUrl}/api/contacts`, {
    headers: authHeader(token),
    data: {
      waId,
      name: `Lead ${waId}`,
      stageId,
      botEnabled: true,
      leadStatus: "open",
    },
  });
  expect(createRes.ok()).toBeTruthy();
}

function authHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
