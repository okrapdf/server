import { describe, expect, it } from "vitest";
import { ClientEventType, EPHEMERAL_EVENT_TYPES, ServerEventType } from "./socket.js";
import {
  CONTROL_PLANE_CLIENT_COMMANDS,
  CONTROL_PLANE_REQUIREMENTS,
  CONTROL_PLANE_RUNTIME_SCOPES,
  CONTROL_PLANE_SERVER_EVENTS,
  CONTROL_PLANE_TODOS,
} from "./control-plane-protocol.js";

describe("control-plane protocol catalog", () => {
  it("covers every client command type exported by socket.ts", () => {
    const expected = new Set(Object.values(ClientEventType));
    const actual = new Set(CONTROL_PLANE_CLIENT_COMMANDS.map((item) => item.type));

    expect(actual).toEqual(expected);
  });

  it("covers every server event type exported by socket.ts", () => {
    const expected = new Set(Object.values(ServerEventType));
    const actual = new Set(CONTROL_PLANE_SERVER_EVENTS.map((item) => item.type));

    expect(actual).toEqual(expected);
  });

  it("keeps persisted flags aligned with ephemeral server event definitions", () => {
    for (const definition of CONTROL_PLANE_SERVER_EVENTS) {
      expect(definition.persisted).toBe(!EPHEMERAL_EVENT_TYPES.has(definition.type));
    }
  });

  it("documents the attach, replay, and permissions requirements explicitly", () => {
    const ids = new Set(CONTROL_PLANE_REQUIREMENTS.map((item) => item.id));

    expect(ids.has("attachable_sessions")).toBe(true);
    expect(ids.has("deterministic_replay")).toBe(true);
    expect(ids.has("first_class_permissions")).toBe(true);
    expect(ids.has("cloudflare_agents_compatible_events")).toBe(true);
  });

  it("declares runtime scopes for local agents and Cloudflare-hosted agents", () => {
    const runtimes = new Set(CONTROL_PLANE_RUNTIME_SCOPES.map((item) => item.runtime));

    expect(runtimes.has("local_agent")).toBe(true);
    expect(runtimes.has("cloudflare_agent")).toBe(true);
    expect(runtimes.has("shared")).toBe(true);
  });

  it("keeps TODO items anchored to the protocol package and documented boundaries", () => {
    for (const todo of CONTROL_PLANE_TODOS) {
      expect(todo.references).toContain("@okrapdf/schemas/control-plane-protocol");
      expect(todo.references).toContain("documents/developers/control-plane-protocol.mdx");
    }
  });

  it("tracks dual-run api rollout and desktop-swift pilot adoption explicitly", () => {
    const ids = new Set(CONTROL_PLANE_TODOS.map((item) => item.id));

    expect(ids.has("dual_run_api_attachable_endpoints")).toBe(true);
    expect(ids.has("desktop_swift_pilot_consumer")).toBe(true);
  });

  it("marks the dual-run api and sse rollout as in progress", () => {
    const byId = new Map(CONTROL_PLANE_TODOS.map((item) => [item.id, item]));

    expect(byId.get("dual_run_api_attachable_endpoints")?.status).toBe("in_progress");
    expect(byId.get("sse_surface_for_attachable_clients")?.status).toBe("in_progress");
  });

  it("documents the current http and sse transport slice for the control plane", () => {
    const commandByType = new Map(
      CONTROL_PLANE_CLIENT_COMMANDS.map((item) => [item.type, item]),
    );
    const eventByType = new Map(
      CONTROL_PLANE_SERVER_EVENTS.map((item) => [item.type, item]),
    );

    expect(commandByType.get(ClientEventType.AGENT_MESSAGE)?.transports).toContain(
      "http",
    );
    expect(commandByType.get(ClientEventType.JOIN_SESSION)?.transports).toContain(
      "http",
    );
    expect(eventByType.get(ServerEventType.AGENT_MESSAGE)?.transports).toContain(
      "sse",
    );
    expect(eventByType.get(ServerEventType.SANDBOX_STATUS)?.transports).toContain(
      "sse",
    );
  });
});
