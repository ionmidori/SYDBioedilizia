import { reconcileDraft } from '../draft';

describe('reconcileDraft — what the client typed against what the server sends', () => {
  it('keeps what the client touched, even when the server changed it', () => {
    const next = reconcileDraft({ mq: '18', mq_pareti: '' }, new Set(['mq']), { mq: '6', mq_pareti: '' });

    expect(next).toEqual({ mq: '18', mq_pareti: '' });
  });

  it('takes the server value of what the client did not touch, and adds what is new', () => {
    const next = reconcileDraft({ mq: '6' }, new Set<string>(), { mq: '7', mq_pareti: '20' });

    expect(next).toEqual({ mq: '7', mq_pareti: '20' });
  });

  it('drops what the server no longer asks for, touched or not', () => {
    const next = reconcileDraft({ mq: '18', mq_pareti: '20' }, new Set(['mq']), { mq_pareti: '20' });

    expect(next).toEqual({ mq_pareti: '20' });
  });

  it('takes the server value of a touched field that came back after leaving', () => {
    const next = reconcileDraft({}, new Set(['mq']), { mq: '9' });

    expect(next).toEqual({ mq: '9' });
  });
});
