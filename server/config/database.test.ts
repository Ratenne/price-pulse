import { describe, expect, it } from "vitest";
import { createDatabaseConfig } from "./database";

describe("createDatabaseConfig", () => {
  it("combines a credential-free URL with separate Supabase credentials", () => {
    const config = createDatabaseConfig({
      DB_URL:
        "postgresql://postgres.project-ref@pooler.supabase.com:6543/postgres",
      DB_USERNAME: "postgres.project-ref",
      DB_PASSWORD: "secret-value",
      DB_SSL: "true",
    });

    expect(config).toMatchObject({
      host: "pooler.supabase.com",
      port: 6543,
      database: "postgres",
      user: "postgres.project-ref",
      password: "secret-value",
      ssl: { rejectUnauthorized: false },
    });
    expect(config.connectionString).toBeUndefined();
  });

  it("uses credentials embedded in a connection URL when overrides are absent", () => {
    const config = createDatabaseConfig({
      DB_URL: "postgresql://postgres:encoded%21pass@db.example.com:5432/app",
      DB_SSL: "false",
    });

    expect(config).toMatchObject({
      user: "postgres",
      password: "encoded!pass",
      database: "app",
      ssl: false,
    });
  });
});
