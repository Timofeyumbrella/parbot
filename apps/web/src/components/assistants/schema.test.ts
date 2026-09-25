import { describe, expect, it } from 'vitest';

import {
  createAssistantSchema,
  deleteAssistantSchema,
  newPublicKey,
  PUBLIC_KEY_PATTERN,
  updateAssistantSchema,
} from './schema';

const ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('createAssistantSchema', () => {
  it('requires a name and lets the slug be derived', () => {
    const parsed = createAssistantSchema.safeParse({
      name: '  Acme Docs ',
      slug: '',
      description: '',
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data).toEqual({ name: 'Acme Docs', slug: '', description: '' });
    }
  });

  it('rejects an empty name, an over long name and a bad slug', () => {
    const parsed = createAssistantSchema.safeParse({ name: '', slug: 'Bad Slug', description: '' });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path[0])).toEqual(['name', 'slug']);
    }

    expect(
      createAssistantSchema.safeParse({ name: 'a'.repeat(81), slug: '', description: '' }).success,
    ).toBe(false);
  });

  it('lowercases a slug the visitor typed', () => {
    const parsed = createAssistantSchema.safeParse({
      name: 'Acme',
      slug: 'ACME-docs',
      description: '',
    });

    expect(parsed.success && parsed.data.slug).toBe('acme-docs');
  });
});

describe('updateAssistantSchema', () => {
  const valid = {
    assistantId: ID,
    name: 'Acme',
    slug: 'acme',
    description: '',
    instructions: '  Call the product Acme.  ',
  };

  it('trims the fields it owns', () => {
    const parsed = updateAssistantSchema.safeParse(valid);

    expect(parsed.success && parsed.data.instructions).toBe('Call the product Acme.');
  });

  it('does not carry the welcome message or suggested questions, which the Widget page owns', () => {
    const parsed = updateAssistantSchema.safeParse({
      ...valid,
      welcomeMessage: 'Hi.',
      suggestedQuestions: 'One',
    });

    expect(parsed.success && Object.keys(parsed.data).sort()).toEqual([
      'assistantId',
      'description',
      'instructions',
      'name',
      'slug',
    ]);
  });

  it('needs a real assistant id and a slug', () => {
    const parsed = updateAssistantSchema.safeParse({ ...valid, assistantId: 'nope', slug: 'a' });

    expect(parsed.success).toBe(false);

    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path[0])).toEqual(['assistantId', 'slug']);
    }
  });
});

describe('deleteAssistantSchema', () => {
  it('validates the id and passes the typed name through', () => {
    expect(deleteAssistantSchema.safeParse({ assistantId: ID, confirmName: 'Acme' }).success).toBe(
      true,
    );
    expect(deleteAssistantSchema.safeParse({ assistantId: '1', confirmName: 'Acme' }).success).toBe(
      false,
    );
  });
});

describe('newPublicKey', () => {
  it('matches the database shape and does not repeat', () => {
    const first = newPublicKey();
    const second = newPublicKey();

    expect(first).toMatch(PUBLIC_KEY_PATTERN);
    expect(second).toMatch(PUBLIC_KEY_PATTERN);
    expect(first).not.toBe(second);
  });
});
