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
