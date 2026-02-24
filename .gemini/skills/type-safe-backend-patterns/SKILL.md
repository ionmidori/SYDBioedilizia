---
name: type-safe-backend-patterns
description: Implement robust, type-safe backend architectures using Supabase and Drizzle ORM. Use when designing database schemas, implementing Row Level Security (RLS), or creating type-safe API endpoints.
---

# Type-Safe Backend Patterns

This skill guides the creation of a modern, type-safe backend layer using Supabase (PostgreSQL) and Drizzle ORM.

## Core Architecture

1.  **Database**: PostgreSQL (via Supabase).
2.  **ORM**: Drizzle ORM (for schema definition, migrations, and queries).
3.  **Auth**: Supabase Auth (integrated with RLS).
4.  **API**: Next.js Server Actions or Route Handlers (protected by RLS).

## 1. Schema Definition (Drizzle)

Define your schema in TypeScript to generate SQL migrations automatically.

```typescript
// src/db/schema.ts
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique(), // References auth.users
  email: text('email').notNull(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations can be defined using drizzle relations API
```

## 2. Type-Safe Client & Queries

Instantiate the typed client.

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

### Queries

```typescript
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getProfile(userId: string) {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });
  return profile; // Typed automatically
}
```

## 3. Row Level Security (RLS) Policies

Do not rely solely on application logic security. Enforce it at the database level.

**Standard Pattern:**
1.  Enable RLS on tables.
2.  Create policies linking `auth.uid()` to your table columns.

```sql
-- SQL (via Supabase Dashboard or Drizzle Kit migration)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = user_id);
```

## 4. Server Actions Pattern

Use Next.js Server Actions for mutations to ensure type safety from frontend to DB.

```typescript
// src/actions/update-profile.ts
'use server'

import { z } from 'zod';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth'; // Your auth helper
import { revalidatePath } from 'next/cache';

const updateSchema = z.object({
  fullName: z.string().min(2),
});

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const data = updateSchema.parse({
    fullName: formData.get('fullName'),
  });

  await db.update(profiles)
    .set({ fullName: data.fullName })
    .where(eq(profiles.userId, session.user.id));

  revalidatePath('/profile');
}
```

## Checklist

- [ ] Define schema in `src/db/schema.ts`.
- [ ] Generate types: `type Profile = typeof profiles.$inferSelect;`.
- [ ] Enable RLS on Supabase Dashboard.
- [ ] Use `drizzle-kit` for migrations (`drizzle-kit generate:pg`).
- [ ] Never expose the Service Key in the client; use Server Actions or Route Handlers.
