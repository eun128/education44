import { DatabaseSync } from 'node:sqlite';
export function localDB(filename = ':memory:') {
  const database = new DatabaseSync(filename);
  const adapter = {
    prepare(sql) {
      const statement = database.prepare(sql);
      const wrap = args => ({ bind: (...next) => wrap(next), first: async () => statement.get(...args) ?? null, all: async () => ({ results: statement.all(...args) }), run: async () => statement.run(...args) });
      return wrap([]);
    },
    async batch(statements) { database.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); database.exec('COMMIT'); return results; } catch (e) { database.exec('ROLLBACK'); throw e; } },
    exec: sql => database.exec(sql), close: () => database.close()
  };
  return adapter;
}
