---
name: advanced-form-patterns
description: Robust form handling using React Hook Form, Zod, and Shadcn Form primitives. Use when building validated forms, multi-step wizards, or Firestore submission flows.
---

# Advanced Form Patterns

React Hook Form + Zod + Shadcn/UI Form for type-safe, performant forms in the SYD frontend.

## Schema-First Design

Define Zod schemas in `web_client/schemas/`. Infer TS types from the schema — never duplicate.

```typescript
// schemas/testimonial-form.ts (real SYD file)
import { z } from 'zod';

export const testimonialFormSchema = z.object({
  rating: z.number().min(1).max(5),
  text: z.string().min(10, {
    message: 'La recensione deve contenere almeno 10 caratteri.',
  }).max(500, {
    message: 'La recensione non può superare i 500 caratteri.'
  }),
});

export type TestimonialFormValues = z.infer<typeof testimonialFormSchema>;
```

## Form Component Pattern

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { schema, type SchemaValues } from '@/schemas/my-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

export function MyForm() {
  const form = useForm<SchemaValues>({
    resolver: zodResolver(schema),
    defaultValues: { /* match schema shape */ },
  });

  async function onSubmit(data: SchemaValues) {
    // Call API or Firestore — never raw fetch, use typed service
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField control={form.control} name="fieldName" render={({ field }) => (
          <FormItem>
            <FormLabel>Label</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </form>
    </Form>
  );
}
```

## Multi-Step Wizard Pattern

SYD uses state-machine steps (not nested routes) for modal wizards. See `BatchSubmitModal.tsx`:

```typescript
type ModalStep = 'preview' | 'loading' | 'confirm' | 'submitting' | 'success';
const [step, setStep] = useState<ModalStep>('preview');
```

- Each step renders conditionally via `AnimatePresence` + `motion.div`
- Transition animations use `M3Spring` presets from `lib/m3-motion.ts`
- Error state resets to previous step (never silent failure)

## Firestore Submission Pattern

Forms that write to Firestore go through the backend API (3-tier rule), not direct SDK calls:

1. `onSubmit` → call typed API function (e.g., `batchApi.createWithPreview()`)
2. Backend validates with equivalent Pydantic model (Golden Sync)
3. Backend writes to Firestore via `run_in_threadpool()`

## Cross-Field Validation

```typescript
const schema = z.object({
  password: z.string().min(8),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Le password non corrispondono',
  path: ['confirm'],
});
```

## Checklist

- [ ] Schema in `schemas/` with `z.infer` type export
- [ ] `zodResolver` in `useForm`
- [ ] Shadcn `Form` wrapper for accessible label-input association
- [ ] Italian error messages for user-facing validation
- [ ] Server-side re-validation with matching Pydantic model (Golden Sync)
- [ ] `M3Spring` transitions for multi-step flows
