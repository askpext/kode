import { cwd as processCwd } from 'process';
import SessionDB from '../../db/sessions.js';
import { Agent } from '../../agent/loop.js';

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

export async function createSessionRuntime(
  config: SessionRuntimeConfig,
  args: SessionRuntimeArgs
): Promise<SessionRuntime> {
  const db = new SessionDB();
  await db.ensureInit();

  const runtimeCwd = processCwd();
  const sessionId = await resolveSessionId(db, runtimeCwd, args);
  const agent = new Agent({
    sessionId,
    cwd: runtimeCwd,
    db,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });

  await agent.initialize();

  return {
    db,
    agent,
    sessionId,
    cwd: runtimeCwd,
    model: config.model,
  };
}

async function resolveSessionId(
  db: SessionDB,
  runtimeCwd: string,
  args: SessionRuntimeArgs
): Promise<string> {
  if (args.resume) {
    const session = await db.getSession(args.resume);
    if (!session) {
      throw new Error(`Session not found: ${args.resume}`);
    }
    return args.resume;
  }

  if (args.new || !args.session) {
    const session = await db.createSession(runtimeCwd);
    return session.id;
  }

  return args.session;
}
