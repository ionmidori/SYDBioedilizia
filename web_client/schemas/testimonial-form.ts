import { z } from 'zod';

export const testimonialFormSchema = z.object({
  name: z.string().trim().min(2, {
    message: 'Il nome deve contenere almeno 2 caratteri.',
  }).max(80, {
    message: 'Il nome non può superare gli 80 caratteri.',
  }),
  location: z.string().trim().min(2, {
    message: 'La località deve contenere almeno 2 caratteri.',
  }).max(80, {
    message: 'La località non può superare gli 80 caratteri.',
  }),
  rating: z.number().min(1).max(5),
  text: z.string().min(10, {
    message: 'La recensione deve contenere almeno 10 caratteri.',
  }).max(500, {
    message: 'La recensione non può superare i 500 caratteri.'
  }),
});

export type TestimonialFormValues = z.infer<typeof testimonialFormSchema>;
