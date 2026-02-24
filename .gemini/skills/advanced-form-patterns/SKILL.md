---
name: advanced-form-patterns
description: Master robust form handling using React Hook Form and Zod. Use when building complex forms with validation, error handling, and type safety.
---

# Advanced Form Patterns

This skill standardizes the implementation of forms using **React Hook Form (RHF)** and **Zod** schema validation. This combination ensures end-to-end type safety and optimal rendering performance.

## Core Technologies

-   **React Hook Form**: Manages form state, validation, and submission without unnecessary re-renders.
-   **Zod**: Defines schema-based validation rules that infer TypeScript types.
-   **Shadcn/UI (Form)**: Provides accessible, pre-styled wrapper components.

## 1. Schema Definition

Always start by defining the shape of your data.

```typescript
// schemas/contact-form.ts
import { z } from "zod";

export const contactFormSchema = z.object({
  username: z.string().min(2, {
    message: "Username must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email.",
  }),
  role: z.enum(["admin", "user", "guest"], {
    required_error: "Please select a role.",
  }),
  bio: z.string().max(160).optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
```

## 2. Form Component Structure

Use the `Form` wrapper from Shadcn/UI (which wraps RHF `FormProvider`).

```tsx
"use client"

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactFormSchema, ContactFormValues } from "@/schemas/contact-form";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function ContactForm() {
  // 1. Initialize Hook
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      username: "",
      email: "",
    },
  });

  // 2. Submit Handler
  function onSubmit(data: ContactFormValues) {
    console.log(data); // Typed data
    // Call Server Action or API here
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="shadcn" {...field} />
              </FormControl>
              <FormDescription>
                This is your public display name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

## 3. Server-Side Validation

Never trust client validation alone. Re-use the same Zod schema on the server.

```typescript
// app/actions.ts
'use server'

import { contactFormSchema } from "@/schemas/contact-form";

export async function submitContact(formData: unknown) {
  const result = contactFormSchema.safeParse(formData);

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  // Process data...
}
```

## 4. Complex Patterns

### Dependent Fields
Use `form.watch()` to conditionally render fields or `superRefine` in Zod for cross-field validation (e.g., password confirmation).

### Async Validation
Use `refine` with an async function for checking database uniqueness (e.g., "Username already taken").

```typescript
const schema = z.object({ username: z.string() })
  .refine(async (data) => {
    const exists = await checkUsername(data.username);
    return !exists;
  }, "Username already taken");
```

## Checklist

- [ ] Create a separate file for the Zod schema (`src/schemas/`).
- [ ] Infer the TypeScript type from Zod (`z.infer`).
- [ ] Use `zodResolver` in `useForm`.
- [ ] Implement `Form` wrapper components for accessibility (Label -> Input association).
- [ ] Validate again on the server using `safeParse`.
