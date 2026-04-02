import initSqlJs, { Database } from 'sql.js';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface Session {
  id: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  createdAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: string;
  isError?: boolean;
}

export interface Todo {
  id: string;
  sessionId: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface GitSnapshot {
  id: string;
  sessionId: string;
  filePath: string;
  originalContent: string;
  createdAt: string;
}

export interface TokenUsage {
  id: string;
  sessionId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
}

class SessionDB {
  private db: Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    const defaultPath = join(homedir(), '.kode', 'sessions.db');
    this.dbPath = dbPath || defaultPath;

    const dir = this.dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private dirname(path: string): string {
    const lastSep = path.lastIndexOf('/') > path.lastIndexOf('\\') 
      ? path.lastIndexOf('/') 
      : path.lastIndexOf('\\');
    return lastSep === -1 ? '.' : path.slice(0, lastSep);
  }

  private async init(): Promise<void> {
    if (this.db) return;

    const SQL = await initSqlJs();

    // Try to load existing database
    if (existsSync(this.dbPath)) {
      const fileBuffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.createTables();
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        tool_results TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS git_snapshots (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        original_content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    this.save();
  }

  private save(): void {
    if (!this.db) return;

    const data = this.db.export();
    const arr = Array.from(data);
    const buffer = Buffer.from(arr);
    writeFileSync(this.dbPath, buffer);
  }

  async ensureInit(): Promise<void> {
    if (!this.db) {
      return this.init();
    }
    return Promise.resolve();
  }

  // Session operations
  async createSession(cwd: string): Promise<Session> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      'INSERT INTO sessions (id, cwd, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [id, cwd, now, now]
    );
    this.save();

    return { id, cwd, createdAt: now, updatedAt: now };
  }

  async getSession(id: string): Promise<Session | null> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    stmt.bind([id]);
    
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as Session;
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  async getSessions(limit: number = 20): Promise<Session[]> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM sessions 
      ORDER BY updated_at DESC 
      LIMIT ?
    `);
    
    const results: Session[] = [];
    stmt.bind([limit]);
    
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Session);
    }
    stmt.free();
    
    return results;
  }

  async updateSession(id: string): Promise<void> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    this.db.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, id]);
    this.save();
  }

  async deleteSession(id: string): Promise<void> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM sessions WHERE id = ?', [id]);
    this.save();
  }

  // Message operations
  async addMessage(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      'INSERT INTO messages (id, session_id, role, content, tool_calls, tool_results, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        message.sessionId,
        message.role,
        message.content,
        message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        message.toolResults ? JSON.stringify(message.toolResults) : null,
        now
      ]
    );
    this.save();

    return { ...message, id, createdAt: now };
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE session_id = ? 
      ORDER BY created_at ASC
    `);
    
    const results: Message[] = [];
    stmt.bind([sessionId]);
    
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as Message & { 
        tool_calls: string | null; 
        tool_results: string | null;
      };
      
      results.push({
        ...row,
        toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
        toolResults: row.tool_results ? JSON.parse(row.tool_results) : undefined,
      });
    }
    stmt.free();
    
    return results;
  }

  async deleteMessages(sessionId: string): Promise<void> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM messages WHERE session_id = ?', [sessionId]);
    this.save();
  }

  // Todo operations
  async setTodos(
    sessionId: string, 
    todos: Array<{ id?: string; content: string; status: Todo['status'] }>
  ): Promise<Todo[]> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();

    // Delete existing todos for this session
    this.db.run('DELETE FROM todos WHERE session_id = ?', [sessionId]);

    // Insert new todos
    const result: Todo[] = [];

    for (const todo of todos) {
      const id = todo.id || uuidv4();
      this.db.run(
        'INSERT INTO todos (id, session_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, sessionId, todo.content, todo.status, now, now]
      );
      result.push({ id, sessionId, content: todo.content, status: todo.status, createdAt: now, updatedAt: now });
    }

    this.save();
    this.updateSession(sessionId);

    return result;
  }

  async getTodos(sessionId: string): Promise<Todo[]> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM todos 
      WHERE session_id = ? 
      ORDER BY created_at ASC
    `);
    
    const results: Todo[] = [];
    stmt.bind([sessionId]);
    
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as Todo);
    }
    stmt.free();
    
    return results;
  }

  async updateTodoStatus(sessionId: string, todoId: string, status: Todo['status']): Promise<void> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    this.db.run(
      'UPDATE todos SET status = ?, updated_at = ? WHERE session_id = ? AND id = ?',
      [status, now, sessionId, todoId]
    );
    this.save();
    this.updateSession(sessionId);
  }

  // Git snapshot operations
  async createSnapshot(sessionId: string, filePath: string, originalContent: string): Promise<GitSnapshot> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      'INSERT INTO git_snapshots (id, session_id, file_path, original_content, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, sessionId, filePath, originalContent, now]
    );
    this.save();

    return { id, sessionId, filePath, originalContent, createdAt: now };
  }

  async getLatestSnapshot(sessionId: string, filePath: string): Promise<GitSnapshot | null> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM git_snapshots 
      WHERE session_id = ? AND file_path = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    stmt.bind([sessionId, filePath]);
    
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as GitSnapshot;
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  async getLatestSnapshotOverall(sessionId: string): Promise<GitSnapshot | null> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM git_snapshots 
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    stmt.bind([sessionId]);
    
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as GitSnapshot;
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  // Token usage operations
  async recordTokenUsage(
    sessionId: string, 
    promptTokens: number, 
    completionTokens: number
  ): Promise<TokenUsage> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const id = uuidv4();
    const now = new Date().toISOString();
    const totalTokens = promptTokens + completionTokens;

    this.db.run(
      'INSERT INTO token_usage (id, session_id, prompt_tokens, completion_tokens, total_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, sessionId, promptTokens, completionTokens, totalTokens, now]
    );
    this.save();

    return { id, sessionId, promptTokens, completionTokens, totalTokens, createdAt: now };
  }

  async getSessionTokenUsage(sessionId: string): Promise<{ 
    totalPromptTokens: number; 
    totalCompletionTokens: number; 
    totalTokens: number;
  }> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT 
        COALESCE(SUM(prompt_tokens), 0) as total_prompt,
        COALESCE(SUM(completion_tokens), 0) as total_completion,
        COALESCE(SUM(total_tokens), 0) as total
      FROM token_usage 
      WHERE session_id = ?
    `);
    
    stmt.bind([sessionId]);
    
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as { 
        total_prompt: number; 
        total_completion: number; 
        total: number;
      };
      stmt.free();
      
      return {
        totalPromptTokens: row.total_prompt,
        totalCompletionTokens: row.total_completion,
        totalTokens: row.total,
      };
    }
    stmt.free();
    
    return {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
    };
  }

  async searchSessions(query: string, limit: number = 10): Promise<Array<{
    session: Session;
    matchCount: number;
    lastMessage?: string;
  }>> {
    await this.ensureInit();
    if (!this.db) throw new Error('Database not initialized');

    const lowerQuery = query.toLowerCase();
    const results: Array<{
      session: Session;
      matchCount: number;
      lastMessage?: string;
    }> = [];

    // Get all sessions
    const sessions = await this.getSessions(100);

    for (const session of sessions) {
      // Search messages in this session
      const messages = await this.getMessages(session.id);
      let matchCount = 0;
      let lastMatch: string | undefined;

      for (const msg of messages) {
        const content = msg.content.toLowerCase();
        if (content.includes(lowerQuery)) {
          matchCount++;
          lastMatch = msg.content;
        }
      }

      if (matchCount > 0) {
        results.push({
          session,
          matchCount,
          lastMessage: lastMatch,
        });
      }
    }

    // Sort by match count and recency
    results.sort((a, b) => {
      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount;
      }
      return new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime();
    });

    return results.slice(0, limit);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default SessionDB;
