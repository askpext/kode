import { cwd as processCwd } from 'process';
import SessionDB from '../../db/sessions.js';
import { Agent } from '../../agent/loop.js';
import { isNativeWindowsEnvironment } from '../../utils/platform.js';

export interface SessionRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface SessionRuntimeArgs {
  session?: string;
  new?: boolean;
  resume?: string;
}

export interface SessionRuntime {
  db: SessionDB;
  agent: Agent;
  sessionId: string;
  cwd: string;
  model: string;
}

export function assertSupportedRuntimePlatform(): void {
  if (isNativeWindowsEnvironment()) {
    throw new Error(
      'Kode currently supports WSL, Linux, and macOS. On Windows, please run it inside WSL.'
    );
  }
}

export async function createSessionRuntime(
  config: SessionRuntimeConfig,
  args: SessionRuntimeArgs
): Promise<SessionRuntime> {
  assertSupportedRuntimePlatform();

  const db = new SessionDB();
  await db.ensureInit();

  const runtimeCwd = processCwd();
  const sessionResolution = await resolveSession(db, runtimeCwd, args);
  const agent = new Agent({
    sessionId: sessionResolution.sessionId,
    cwd: sessionResolution.cwd,
    db,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });

  await agent.initialize();

  return {
    db,
    agent,
    sessionId: sessionResolution.sessionId,
    cwd: sessionResolution.cwd,
    model: config.model,
  };
}

async function resolveSession(
  db: SessionDB,
  runtimeCwd: string,
  args: SessionRuntimeArgs
): Promise<{ sessionId: string; cwd: string }> {
  if (args.resume) {
    const session = await db.getSession(args.resume);
    if (!session) {
      throw new Error(`Session not found: ${args.resume}`);
    }
    return {
      sessionId: args.resume,
      cwd: session.cwd,
    };
  }

  if (args.new || !args.session) {
    const session = await db.createSession(runtimeCwd);
    return {
      sessionId: session.id,
      cwd: runtimeCwd,
    };
  }

  const session = await db.getSession(args.session);
  return {
    sessionId: args.session,
    cwd: session?.cwd || runtimeCwd,
  };
}
